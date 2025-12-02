import asyncio

import utilities.utilities as utilities
import utilities.lights as lights

class Game:
    def __init__(self, main, name = 'test'):
        self.button = utilities.Button()
        self.lights = lights.Lights()
        self.name = name
        self.main = main
    
    async def loop(self):
        if self.button.pressed:  # Button pressed
            self.lights.all_on(lights.GREEN, 0.1)
        else:  # Button released
            self.lights.all_off()

    def close(self):
        self.lights.all_off() 
            
    async def run(self, response = 0.1):
        """
        Async task that continually runs
        """
        try:
            print(f'starting game {self.name}')
            self.start()
            while self.main.running:
                await self.loop()
                await asyncio.sleep(response)
        finally:
            self.close()
            print(f"ending game {self.name}")

#-------------------------------Test code-----------------------------------------
'''
class Test(Game):
    def __init__(self, color):
        super().__init__('myTest')
        self.color = color

    async def loop(self):
        if self.button.pressed:  # Button pressed
            self.lights.all_on(self.color, 0.1)
        else:                    # Button released
            self.lights.all_off()
            
fred = Test(lights.BLUE)

class SimplePlushie:
    def __init__(self):
        self.running = True
        
george = SimplePlushie()

async def main():
    george.running = True
    task = asyncio.create_task(fred.run(george))
    for i in range(10):
        print('@',end='')
        await asyncio.sleep(1)
    george.running = False
    print('ending game')
    await task
    
asyncio.run(main())
'''
