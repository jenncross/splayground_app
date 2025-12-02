import time, json

from utilities.utilities import Button
import utilities.lights as lights
from games.game import Game

INTENSITY = 0.1

class Hot_cold(Game):
    def __init__(self, main):
        super().__init__(main, 'Hot/Cold Game')
        self.main = main
        
    def start(self):
        self.button = Button()
        self.led = lights.Lights()
        self.led.all_off()
        
    async def loop(self):
        """
        Async task to read the ping strength of hidden_gem.
        """
        if self.main.topic == '/ping':
            try:
                print(self.main.hidden_gem)
                print(self.main.rssi)
                strength = self.main.rssi[self.main.hidden_gem][0]
                strength += 30 # best possbile case
                s = int(12 + 3 * strength/10)
                max(0, min(s, 11))
                print('strength = ',strength)
                self.led.show_number(s, lights.RED, INTENSITY)
            except:
                pass

        
    def close(self):
        self.lights.all_off() 
        self.button.irq = None
        