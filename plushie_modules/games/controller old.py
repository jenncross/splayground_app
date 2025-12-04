import time, json
import now
from machine import SoftI2C, Pin
import ssd1306

ROW = 10

class Controller:
    def __init__(self):
        self.display = Display()
        self.display.clear_screen()
        self.display.add_text('1: Music')
        self.display.add_text('2: Shake')
        self.display.add_text('3: Hot Cold')
        self.display.add_text('4: Jump')
        self.display.add_text('5: Clap')
        self.display.add_text('6: Rainbow')
        
        self.display.last_row = None
        self.row = 1
        
        self.button = Button()
        
    def connect(self):
        def my_callback(msg, mac, rssi):
            print(mac, msg, rssi)
            self.n.publish(msg, mac)

        self.n = now.Now(my_callback)
        self.n.connect()
        self.mac = self.n.wifi.config('mac')
        print(self.mac)
        
    def shutdown(self):
        stop = json.dumps({'topic':'/game', 'value':-1})
        self.n.publish(stop)
        
    def ping(self):
        ping = json.dumps({'topic':'/ping', 'value':1})
        self.n.publish(ping)
        
    def choose(self, game):
        mac = json.dumps({'topic':'/gem', 'value':self.mac})
        self.n.publish(mac)
        time.sleep(1)
        setup = json.dumps({'topic':'/game', 'value':game})
        self.n.publish(setup)

class Display:
    def __init__(self):
        i2c = SoftI2C(scl = Pin(23), sda = Pin(22))
        self.display = ssd1306.SSD1306_I2C(128, 64,i2c)
        self.row = 1
        self.last_row = None
        
    def clear_screen(self):
        self.display.fill(0)
        self.display.show()
        self.row = 1
        
    def add_text(self, text):
        self.display.text(text, 2, self.row, 1)  # 1 means white text
        self.row += ROW
        self.display.show()
        
        
    def box_row(self, row):
        if self.last_row: self.display.rect(0,self.last_row,128,ROW-1,0)
        self.display.rect(0,row,128,ROW-1,1)
        self.last_row = row
        self.display.show()
        
    def close(self):
        self.clear_screen()

class Button:
    def __init__(self):
        self.button = Pin(19, Pin.IN, Pin.PULL_UP)
        self.button.irq(handler=self.update, trigger=Pin.IRQ_FALLING)
        self.led = Pin(17, Pin.OUT)
        self.led.value(1)
        self.state = 0
        
    def update(self, p):
        accept = False
        start = time.ticks_ms()
        while self.button.value() == 0:
            if time.ticks_ms()-start > 1000:
                accept = True
                self.led.value(not self.led.value())
                time.sleep(0.2)
        self.led.value(1)
        self.state = 2 if accept else 1
               
    def close(self):
        self.button.irq = None

        
fred = Controller()
fred.display.row = 1
fred.display.box_row(fred.display.row)
fred.connect()

while True:
    time.sleep(0.5)
    fred.ping()
    
    if fred.button.state == 1:
        fred.display.row += ROW
        if fred.display.row > 60: fred.display.row = 1
        fred.button.state = 0
        print('move ', fred.display.row)
        fred.display.box_row(fred.display.row)
        
    if fred.button.state == 2:
        fred.button.state = 0
        select = int((fred.display.row)/10)
        print('select ', select)
        fred.choose(select)
        
        
        

