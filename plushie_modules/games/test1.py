import asyncio

import utilities.utilities as utilities
import utilities.lights as lights
from games.game import Game

class Play(Game):
    def __init__(self, color):
        super().__init__('myTest')
        self.color = color
        self.num = 0
        
    async def loop(self):
        if self.button.pressed:  # Button pressed
            self.num = (self.num + 1) % (lights.NUM_LED+1)
            for i in range(self.num):
                self.lights.on(i, self.color, 0.1)
                self.lights.off(i+1)
        else:  # Button released
            self.lights.all_off()
            self.num = 0
    
fred = Play(lights.PURPLE)

class SimplePlushie:
    def __init__(self):
        self.running = True
        
george = SimplePlushie()

async def main():
    task = asyncio.create_task(fred.run(george))
    for i in range(10):
        print('@',end='')
        await asyncio.sleep(1)
    george.running = False
    print('ending game')
    await task
    
asyncio.run(main())

