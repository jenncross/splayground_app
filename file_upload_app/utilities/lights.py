import neopixel
from machine import Pin
import asyncio

NUM_LED = 12
LED_PIN = 20
RED    = [255, 0, 0]
YELLOW = [255,255,0]
GREEN  = [0, 255, 0]
BLUE   = [0, 0, 255]
PURPLE = [255, 0, 255]
OFF    = [0, 0, 0]

class Lights():
    def __init__(self):
        self.np = neopixel.NeoPixel(Pin(LED_PIN), NUM_LED)

    def on(self, num, color = RED, intensity = 1):
        if num < NUM_LED:
            self.np[num] = [int(c*intensity) for c in color]
            self.np.write()

    def off(self, num):
        self.on(num, [0,0,0])
        
    def all_off(self, num = NUM_LED):
        for i in range(NUM_LED):
            self.off(i)
        
    async def animate(self, color = RED, intensity = 0.3, number = NUM_LED, repeat= 1, timeout = 1.0, speed = 0.1):
        for j in range(repeat):
            for i in range(number):
                self.on(i, color, intensity)
                self.off(i+1)
                await asyncio.sleep(speed)
            
        if timeout > 0.0:
            #turn off all LEDs
            await asyncio.sleep(timeout)
            self.all_off()

    def show_number(self, number, color = RED, intensity = 1):
        for i in range(number):
            self.on(i, color,intensity)   
    
async def main():
    a = Lights()
    await a.animate()
    