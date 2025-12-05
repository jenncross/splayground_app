import time
import asyncio

from utilities import *
from lights import *
from i2c_bus import *
from wifi import *

def button_test():
    print('Testing the button - click it any time')
    button = Button()
    while not button.pressed:
        print('.', end='')
        time.sleep(0.1)
    print('')

def motor_test():
    print('Testing the motor - haptic feedback')
    motor = Motor()
    motor.run()
    
def buzzer_test():
    print('Testing the buzzer playing A4 for 2 sec')
    buzzer = Buzzer()
    buzzer.play(440)
    time.sleep(2)
    buzzer.stop()

def light_test():
    print('Testing the neopixels - animate red then only 5 leds in purple twice')
    async def main():
        a = Lights()
        await a.animate()
        await a.animate(color = PURPLE, intensity = 0.2, number = 5, repeat= 2, timeout = 2.0, speed = 0.5)
    
    asyncio.run(main())

def accel_test():
    print('Testing the accelerometer 10 times')
    a = LIS2DW12()
    time.sleep(0.1)
    for i in range(10):
        print(f"Test: {i+1} - {a.read_accel()}")
        time.sleep(1)
    
    print("Done testing")

def battery_test():
    print('Testing the battery')
    b = Battery()
    print('percentage = ',b.read())

def wifi_test():
    print('Testing the wifi: Make sure you have a secrets.py file loaded')
    wifi = Wifi()
    wifi.connect()



button_test()
motor_test()
buzzer_test()
light_test()
accel_test()
battery_test()
wifi_test()

hibernate()