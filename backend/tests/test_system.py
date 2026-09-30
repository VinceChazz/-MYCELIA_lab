"""Offline, safety and data-fusion regression tests (no network or hardware required)."""
import copy
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.main import create_app
from backend.memory.memory_manager import MemoryManager
from backend.db import Database


@pytest.fixture
def client(tmp_path):
    app = create_app(str(tmp_path / "farm.sqlite"))
    with TestClient(app) as test:
        yield test


def test_unified_farm_snapshot_and_decline(client):
    response = client.get('/api/bootstrap')
    assert response.status_code == 200
    farm = response.json()
    assert farm['farm']['name'] == 'Demo Farm'
    assert {f['crop'] for f in farm['fields']} == {'Rice','Tomato','Chilli','Cotton','Groundnut'}
    tomato = next(f for f in farm['fields'] if f['id'] == 'FIELD_02')
    assert tomato['sensor']['soil_moisture'] == 23.5
    assert tomato['crop_cycles'][0]['crop'] == 'Chilli'
    assert tomato['satellite_trend']['consecutive_declines'] >= 3
    assert tomato['health']['status'] == 'Moderate stress'
    assert tomato['health']['confidence'] < 1
    assert tomato['health']['observed'][1]['source'] == 'simulated satellite'
    assert tomato['irrigation']['duration_min'] == 18
    assert tomato['irrigation']['requires_farmer_confirmation'] is True
    assert 'not a direct measure' in tomato['energy']['interpretation_note']
    assert len(farm['markets']) == 5
    assert farm['weather']['source'] == 'simulated weather'


def test_sensor_validation_and_unreliable_data_blocks_pump(client):
    original = client.get('/api/fields/FIELD_02').json()['sensor']
    invalid = client.post('/api/sensors/ingest', json={**original, 'id':str(uuid4()),'soil_moisture':101})
    assert invalid.status_code == 422
    suspect = client.post('/api/sensors/ingest', json={**original,'id':str(uuid4()),
        'timestamp':datetime.now(timezone.utc).isoformat(),'soil_moisture':90})
    assert suspect.status_code == 200 and suspect.json()['quality'] == 'suspect'
    plan = client.get('/api/irrigation/recommendation/FIELD_02').json()['irrigation']
    assert not plan['safety']['allowed']
    assert 'SENSOR DATA UNRELIABLE' in plan['safety']['reasons'][0]
    denied = client.post('/api/irrigation/start', json={'field_id':'FIELD_02','confirmed':True,
        'confirmation':'Field 02','duration_min':18})
    assert denied.status_code == 400
    assert client.get('/api/irrigation/status/FIELD_02').json()['status'] == 'OFF'


def test_pump_requires_explicit_confirmation_and_stops_on_no_flow(client):
    unconfirmed = client.post('/api/irrigation/start',json={'field_id':'FIELD_02','duration_min':18})
    assert unconfirmed.status_code == 403
    wrong = client.post('/api/irrigation/start',json={'field_id':'FIELD_02','duration_min':18,
        'confirmed':True,'confirmation':'Field 03'})
    assert wrong.status_code == 400
    excessive = client.post('/api/irrigation/start',json={'field_id':'FIELD_02','duration_min':40,
        'confirmed':True,'confirmation':'Field 02'})
    assert excessive.status_code == 400
    unnecessary = client.post('/api/irrigation/start',json={'field_id':'FIELD_01','duration_min':10,
        'confirmed':True,'confirmation':'Field 01'})
    assert unnecessary.status_code == 400
    started = client.post('/api/irrigation/start',json={'field_id':'FIELD_02','duration_min':18,
        'confirmed':True,'confirmation':'Field 02'})
    assert started.status_code == 200 and started.json()['flow_rate'] == 16
    assert client.get('/api/irrigation/recommendation/FIELD_02').json()['irrigation']['safety']['allowed'] is False
    db = client.app.state.db
    with db.connection() as conn:
        conn.execute("UPDATE pump_states SET flow_rate=0 WHERE field_id='FIELD_02'")
    noflow = client.get('/api/irrigation/status/FIELD_02')
    assert noflow.status_code == 400
    assert client.get('/api/irrigation/status/FIELD_02').json()['emergency_latched'] == 1
    blocked = client.post('/api/irrigation/start',json={'field_id':'FIELD_02','duration_min':18,
        'confirmed':True,'confirmation':'Field 02'})
    assert blocked.status_code == 400
    reset = client.post('/api/irrigation/reset',json={'field_id':'FIELD_02','confirmed':True,'confirmation':'Field 02'})
    assert reset.status_code == 200 and reset.json()['status']=='OFF'


def test_offline_assistant_stores_memory_and_answers_in_hindi(client):
    response = client.post('/api/assistant/ask',json={'question':'क्या मुझे पानी देना चाहिए?',
        'field_id':'FIELD_02','language':'hi','allow_remote':False,'message_id':'q-001'})
    assert response.status_code == 200
    assert response.json()['mode'] == 'offline intelligence'
    assert '23.5%' in response.json()['answer']
    saved = client.get('/api/memory/q-001').json()
    assert 'पानी' in saved['content']
    again = client.get('/api/memory/search?q=पानी&field_id=FIELD_02').json()
    assert any(item['id']=='q-001' for item in again)
    manager = MemoryManager(Database(client.app.state.db.path))  # survives a new manager / connection
    assert manager.retrieve_memory('q-001')['id']=='q-001'
    updated = client.put('/api/memory/q-001',json={'content':'Farmer prefers drip irrigation',
        'category':'preference','field_id':'FIELD_02'})
    assert updated.json()['version'] == 2
    assert client.delete('/api/memory/q-001').json()['deleted'] is True
    assert client.get('/api/memory/q-001').status_code == 404


def test_vernacular_fertilizer_advice_never_invents_a_dose(client):
    answer = client.post('/api/assistant/ask', json={'question':'ఎరువు ఎంత?',
        'field_id':'FIELD_02','language':'te','allow_remote':False}).json()['answer']
    assert 'నేల పరీక్ష' in answer
    assert 'pH' in answer


def test_adequate_field_receives_no_water_advice(client):
    answer = client.post('/api/assistant/ask', json={'question':'Should I water?',
        'field_id':'FIELD_01','language':'en','allow_remote':False}).json()
    assert 'No watering needed' in answer['answer']
    assert '0 minutes' not in answer['answer']


def test_sync_is_idempotent_and_offline_pump_events_are_history_only(client):
    sensor = client.get('/api/fields/FIELD_02').json()['sensor']
    sensor = {**sensor, 'id':'offline-sensor-1', 'timestamp':datetime.now(timezone.utc).isoformat()}
    op = {'op_id':'device-a:1','entity':'sensor','entity_id':'offline-sensor-1','operation':'upsert',
          'payload':sensor,'created_at':datetime.now(timezone.utc).isoformat()}
    received = client.post('/api/sync/batch',json={'operations':[op,op]})
    assert received.status_code==200 and len(received.json()['accepted'])==2
    db = client.app.state.db
    with db.connection() as conn:
        assert conn.execute("SELECT COUNT(*) FROM sensor_readings WHERE id='offline-sensor-1'").fetchone()[0] == 1
    event = {'op_id':'device-a:2','entity':'irrigation_event','entity_id':'offline-irrigation-1',
      'operation':'upsert','payload':{'field_id':'FIELD_02','source':'simulated','duration_min':18,
       'water_liters':288,'status':'completed'},'created_at':datetime.now(timezone.utc).isoformat()}
    assert client.post('/api/sync/batch',json={'operations':[event]}).json()['accepted'] == ['device-a:2']
    assert client.get('/api/irrigation/status/FIELD_02').json()['status'] == 'OFF'
    forged = copy.deepcopy(event)
    forged['op_id']='device-a:3';forged['entity_id']='forged-event';forged['payload']['source']='hardware'
    assert client.post('/api/sync/batch',json={'operations':[forged]}).json()['rejected']


def test_memory_merge_never_silently_overwrites_conflicts(client):
    manager = MemoryManager(client.app.state.db)
    local = manager.store_memory('Field soil is loam','soil','FIELD_02',memory_id='known-note')
    conflict = manager.sync_memory([{**local,'content':'Conflicting remote edit'}])
    assert conflict['conflicts'][0]['reason']=='concurrent edit'
    assert manager.retrieve_memory('known-note')['content']=='Field soil is loam'
    newer = manager.sync_memory([{**local,'content':'Newer verified soil note','version':2}])
    assert newer['accepted']==['known-note']
    assert manager.retrieve_memory('known-note')['content']=='Newer verified soil note'
    assert manager.sync_memory([{**local,'version':1}])['conflicts'][0]['reason']=='local version is newer'


def test_reset_requires_confirmation(client):
    assert client.post('/api/demo/reset',json={'confirmation':'oops'}).status_code==403
    assert client.post('/api/demo/reset',json={'confirmation':'RESET DEMO'}).json()['fields']==5
    assert len(client.get('/api/bootstrap').json()['fields'])==5
