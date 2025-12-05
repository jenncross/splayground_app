from machine import Pin, PWM
import time
import random
import asyncio

from utilities import Button,Buzzer

# Frequencies for all 12 notes (in Hz)
NOTES = {
    'C4': 262, 'C#4': 277, 'D4': 294, 'D#4': 311,
    'E4': 330, 'F4': 349, 'F#4': 370, 'G4': 392,
    'G#4': 415, 'A4': 440, 'A#4': 466, 'B4': 494,
    'C5': 523,
}

class Play:
    def __init__(self):
        self.running = True
        self.button = Button()
        self.buzzer = Buzzer()
    
    async def run(self):
        """
        Async task to play a random note while button is pressed.
        Stops when self.running is set to False.
        """
        task_id = id(asyncio.current_task())
        
        # Pick a random note
        note = random.choice(list(NOTES.keys()))
        frequency = NOTES[note]
        
        print(f"[Task {task_id}] you were assigned {note} at a frequency of {frequency}")
        
        try:
            while self.running:
                if self.button.pressed:  # Button pressed
                    self.buzzer.play(frequency)
                else:  # Button released
                    self.buzzer.stop()  # Silence                
                await asyncio.sleep(0.01)
        finally:
            self.buzzer.close()
            print(f"[Task {task_id}] shutting down")

# Usage example:
async def main():
    play = Play()
    task = asyncio.create_task(play.run())
    await asyncio.sleep(20)
    play.running = False
    await task

asyncio.run(main())