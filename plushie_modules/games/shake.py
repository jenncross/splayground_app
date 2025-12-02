import random
import math
import asyncio

from utilities.utilities import Button
import utilities.lights as lights
import utilities.i2c_bus as i2c_bus
from games.game import Game

#  ALL ESPNow happens in main.py

COLORS = [lights.RED, lights.YELLOW, lights.GREEN, lights.BLUE, lights.PURPLE]

class Shake(Game):
    def __init__(self, main):
        super().__init__(main, 'Shakes Game')
        self.main = main
        
    def start(self):
        self.button = Button()
        self.color = random.choice(COLORS)
        print(f'your color is {self.color}')
        self.level = 0
        self.accel = i2c_bus.LIS2DW12()
        
    def abs_accel(self):
        x,y,z = self.accel.read_accel()
        return math.sqrt(x**2+y**2+z**2) - 1
        

    async def loop(self):
        """
        Async task to play increase the number of leds shown with how
        vigorous you shake.  Hitting the button resets
        """
        if self.button.pressed:  # Button pressed
            self.level = 0
            self.lights.all_off()
        else:  # Button released
            acc = min(12, int(abs(self.abs_accel()) * 4))
            if self.level < acc: self.level = acc
            self.lights.all_on(self.color, 0.1, self.level)

    def close(self):
        self.lights.all_off()
        self.button.irq = None


