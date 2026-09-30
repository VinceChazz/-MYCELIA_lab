"""The five-minute judging path, exercised entirely without cloud or real hardware."""
from datetime import datetime, timezone
from uuid import uuid4

from fastapi.testclient import TestClient
from backend.main import create_app


def test_integrated_offline_to_online_walkthrough(tmp_path):
    with TestClient(create_app(str(tmp_path/'walkthrough.sqlite'))) as client:
        farm = client.get('/api/bootstrap').json()
        assert farm['farm']['name'] == 'Demo Farm'
        tomato = client.get('/api/fields/FIELD_02').json()
        assert tomato['sensor']['soil_moisture'] == 23.5
        assert tomato['satellite_trend']['consecutive_declines'] >= 3
        assert tomato['health']['possible_causes']
        assert tomato['irrigation']['why'][0]['kind'] == 'observed'
        assert tomato['energy']['energy_status'] == 'SUFFICIENT'

        # The safety gate and explicit farmer confirmation authorize a SIMULATED cycle.
        started = client.post('/api/irrigation/start', json={
            'field_id':'FIELD_02','confirmed':True,'confirmation':'Field 02','duration_min':18})
        assert started.status_code == 200
        assert started.json()['event_id']
        before = tomato['sensor']['soil_moisture']
        for _ in range(2):
            sample = client.post('/api/sensors/simulate/FIELD_02').json()
        assert sample['soil_moisture'] > before
        assert sample['flow_rate'] == 16
        stopped = client.post('/api/irrigation/stop', json={
            'field_id':'FIELD_02','confirmed':True,'confirmation':'Field 02',
            'simulated_elapsed_min':6})
        assert stopped.json()['status'] == 'OFF'
        assert stopped.json()['today_water_liters'] >= 210+96

        # A browser with no network can continue locally; replay only durable HISTORY.
        offline_sensor = {**sample, 'id':str(uuid4()),
            'timestamp':datetime.now(timezone.utc).isoformat(), 'soil_moisture':sample['soil_moisture']+.1,
            'pump_status':'OFF','flow_rate':0}
        op = {'op_id':'device-1:offline-reading','entity':'sensor','entity_id':offline_sensor['id'],
              'operation':'upsert','payload':offline_sensor,'created_at':datetime.now(timezone.utc).isoformat()}
        conversation = {'op_id':'device-1:question','entity':'conversation','entity_id':'local-question-01',
              'operation':'upsert','payload':{'field_id':'FIELD_02','language':'hi',
              'question':'पानी देना चाहिए?','answer':'पहले खेत की जाँच करें।'},
              'created_at':datetime.now(timezone.utc).isoformat()}
        synced = client.post('/api/sync/batch',json={'operations':[op,conversation]}).json()
        assert len(synced['accepted']) == 2 and not synced['rejected']
        assert len(client.post('/api/sync/batch',json={'operations':[op,conversation]}).json()['accepted']) == 2
        assert 'पहले खेत' in client.get('/api/memory/local-question-01').json()['content']
        assert client.get('/api/sync/status').json()['device_records_received'] == 2
        assert client.get('/api/weather').json()['source'] == 'simulated weather'
        assert any(m['crop'] == 'Tomato' for m in client.get('/api/markets').json())
