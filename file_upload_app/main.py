from pyscript import when, document, window
import asyncio

import channel as _ch
channel = _ch.CEEO_Channel("hackathon", "@chrisrogers", "talking-on-a-channel",
                                 divName = 'all_things_channels', suffix='_test')

import RS232
myRS232 = RS232.CEEO_RS232(divName = 'all_things_rs232', suffix = '1', myCSS = False, default_code='sd')

files = [('/utilities.py', 'utilities.py'), 
         ('/lights.py', 'lights.py'),
         ('/i2c_bus.py', 'i2c_bus.py'),
         ('/wifi.py', 'wifi.py'),
        ]

@when("click", "#btnA1")
def load_util():
    if myRS232.uboard.connected:
        for (file, remote) in files:
            with open(file, 'r') as f: code = f.read()
            await myRS232.uboard.board.upload(remote, code)
        await myRS232.uboard.board.write('\x04')
        await asyncio.sleep(2)
        await myRS232.uboard.board.write('\x03')

@when("click", "#btnB1")
def load_sample():
    with open('/unit_test.py', 'r') as f: myRS232.python.code = f.read()
