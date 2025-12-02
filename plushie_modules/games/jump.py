import random
import math
import asyncio
import time 
from utilities.utilities import Button
import utilities.lights as lights
import utilities.i2c_bus as i2c_bus
from games.game import Game


FREEFALL_THRESHOLD = 0.2  # Magnitude below this = free fall (adjust as needed)
MIN_EVENT_SPACING = 500   # Minimum ms between jumps (prevents double-counting)

COLORS = [lights.RED, lights.YELLOW, lights.GREEN, lights.BLUE, lights.PURPLE]

class Jump(Game):
    def __init__(self, main):
        super().__init__('Jump Game')
        self.main = main
        
    def start(self):
        self.button = Button()
        self.color = random.choice(COLORS)
        print(f'your color is {self.color}')
        self.level = 0
        self.accel = i2c_bus.LIS2DW12()
        print("jumping")
        self.in_jump = False
        self.last_jump_time = 0
        
    def abs_accel(self):
        x,y,z = self.accel.read_accel()
        return math.sqrt(x**2+y**2+z**2) - 1
        

    async def loop(self):
        """
        Async task to play increase the number of leds shown with every
        jump.  Hitting the button resets
        """
        if self.button.pressed:  # Button pressed
            self.level = 0
            self.lights.all_off()
        else:  # Button released
            x,y,z = self.accel.read_accel()
            current_time = time.ticks_ms()
            magnitude = (x**2 + y**2 + z**2)**0.5
            if magnitude < FREEFALL_THRESHOLD:
                if not self.in_jump:
                    if time.ticks_diff(current_time, self.last_jump_time) > MIN_EVENT_SPACING:
                        self.level += 1
                        self.last_jump_time = current_time
                        self.in_jump = True
                else:
                    if self.in_jump:
                        self.in_jump = False

            self.level = self.level%12
            self.lights.all_on(self.color, 0.1, self.level)

    def close(self):
        self.lights.all_off()
        self.button.irq = None

