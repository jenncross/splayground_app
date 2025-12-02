import random
import asyncio

from utilities.utilities import Button,Buzzer
import utilities.lights as lights
from games.game import Game

#  ALL ESPNow happens in main.py

# Frequencies for all 12 notes (in Hz)
NOTES = {
    'C4': 262, 'C#4': 277, 'D4': 294, 'D#4': 311,
    'E4': 330, 'F4': 349, 'F#4': 370, 'G4': 392,
    'G#4': 415, 'A4': 440, 'A#4': 466, 'B4': 494,
    'C5': 523,
}

class Notes(Game):
    def __init__(self, main):
        super().__init__(main, 'Notes Game')
        self.main = main
        
    def start(self):
        self.button = Button()
        self.buzzer = Buzzer()
        self.note = random.choice(list(NOTES.keys()))
        self.frequency = NOTES[self.note]
        print(f"You were assigned {self.note} at a frequency of {self.frequency}")

    async def loop(self):
        """
        Async task to play a random note while button is pressed.
        Stops when self.running is set to False.
        """
        if self.button.pressed:  # Button pressed
            self.buzzer.play(self.frequency)
            self.lights.all_on(lights.GREEN, 0.1)
        else:  # Button released
            self.buzzer.stop()  # Silence
            self.lights.all_off()

    def close(self):
        self.lights.all_off() 
        self.buzzer.close()
        self.button.irq = None

