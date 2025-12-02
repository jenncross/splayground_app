from machine import Pin, PWM
import time
import random
import asyncio

import utilities.utilities as utilities
import utilities.lights as lights

class Play:
    def __init__(self, color):
        self.running = True
        self.button = utilities.Button()
        self.lights = lights.Lights()
        self.color = color
    
    async def run(self):
        """
        Async task to blink lights when button is pressed.
        Stops when self.running is set to False.
        """        
        try:
            num = 0
            while self.running:
                if self.button.pressed:  # Button pressed
                    num = (num + 1) % (lights.NUM_LED+1)
                    for i in range(num):
                        self.lights.on(i, self.color, 0.1)
                        self.lights.off(i+1)
                        await asyncio.sleep(0.01)
                else:  # Button released
                    self.lights.all_off()
                    num = 0
                await asyncio.sleep(0.01)
        finally:
            self.lights.all_off()  
            print("shutting down")

# Usage example:
async def main(obj):
    play = Play(lights.GREEN)
    task = asyncio.create_task(play.run())
    while obj.running:
        print('@',end='')
        await asyncio.sleep(1)
    print('ending test game')
    play.running = False
    await task

