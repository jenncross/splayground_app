import time

import utilities.now as now


def now_callback(msg, mac, rssi):
    print(msg, mac, rssi)
    
espnow = now.Now()
espnow.connect()
mac = espnow.wifi.config('mac')
print('my mac address is ',[hex(b) for b in mac])
espnow.antenna()

print('ESPNow is running')

for i in range(10):
    espnow.publish(f'test{i}')
    time.sleep(10)
    
espnow.close()