import asyncio

from games.sound import Notes
from games.shake import Shake

class SimplePlushie:
    def __init__(self):
        self.running = True
        
plush = SimplePlushie()

async def main(code):
    plush.running = True
    task = asyncio.create_task(code.run(plush))
    for i in range(10):
        print('@',end='')
        await asyncio.sleep(1)
    plush.running = False
    await task

fred = Notes()
asyncio.run(main(fred))

bill = Shake()   
asyncio.run(main(bill))
