import random
import math
import asyncio

from utilities.utilities import Button
import utilities.lights as lights
import utilities.i2c_bus as i2c_bus
from games.game import Game

COLORS = [lights.VIOLET, lights.INDIGO, lights.BLUE, lights.GREEN, lights.YELLOW, lights.ORANGE, lights.RED]

class Rainbow(Game):
    def __init__(self, main):
        super().__init__('Rainbow Game')
        self.main = main
        
    def start(self):
        self.button = Button()
        self.level = 0
        

    async def loop(self):
        for i in range(12):
            self.lights.on(i, COLORS[i%7])

    def close(self):
        self.lights.all_off()
        self.button.irq = None



