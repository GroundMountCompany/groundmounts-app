# Manual QA checklist

Everything here needs a real phone in a real hand. The automated suite covers
the logic and the wiring; this covers the things a headless browser is
structurally unable to tell you — where a thumb lands, what a keyboard does to
a layout, whether text is readable in sunlight.

Run the whole list on **one iPhone and one Android** before promoting to
production. It takes about twenty minutes per device.

**Devices that matter:** an iPhone with a notch or Dynamic Island (Safari), and
an Android in Chrome. Customers skew 50+, so if you have access to a phone with
the system font size turned up, use it.

---

## Before you start

- [ ] Note the preview URL and the commit it was built from.
- [ ] Put the phone on cellular, not office wifi. Satellite tiles over LTE is
      the real condition.
- [ ] Turn the screen brightness down to about a third and go outside for the
      map steps. This is where the array fill and the trench line have to be
      distinguishable.

---

## Step 1 — Address

- [ ] The address box takes focus without the page jumping.
- [ ] Typing three characters brings suggestions; they are readable and tappable
      without zooming.
- [ ] Tapping the box drops the sheet out of the way on its own.
- [ ] Tapping a suggestion drops the pin and the map settles on the property.
- [ ] **The keyboard does not cover the suggestions.** iOS Safari resizes the
      visual viewport rather than the layout viewport; this is the single most
      common way a form like this becomes unusable.
- [ ] Drag the pin. It follows the finger and the map does not slide underneath.
- [ ] Rotate to landscape and back. Nothing is stranded off-screen.

## Step 2 — Bill

- [ ] **"Take a photo" opens the camera directly**, not the file picker.
- [ ] **"Choose a photo or PDF" offers Photo Library and Browse**, and a bill
      already saved on the phone can be picked. This is the one the owner could
      not reach in 8.6, so check it on a real iPhone every time.
- [ ] **The moment you choose a file**, the buttons are replaced by a card with
      a thumbnail of your own bill (or a PDF icon), a moving bar, and how long
      it usually takes. There must be no moment where you wonder whether the
      tap registered.
- [ ] On success the card says how many months it found **before** the table
      appears.
- [ ] A bad photo says "Couldn't read that one" on the card for a couple of
      seconds, then hands over to the manual fields with nothing to dismiss.
- [ ] The months come back in a table you can actually read at arm's length.
- [ ] Correct one figure. The annual total updates as you type.
- [ ] Confirm. The table collapses to one line with **Change**.
- [ ] Kill the browser, reopen the URL: still confirmed, still the same total.
- [ ] Try a deliberately bad photo — a blurry one, or something that is not a
      bill. It must land on "Couldn't read that one. Type it in instead." with
      the manual fields right there and nothing to dismiss first.
- [ ] Type in the bill and rate manually. The `$` and the cents field both
      accept what you type, and `0.` does not become `NaN`.
- [ ] **The keyboard does not cover the field you are typing in**, on either
      the bill or the rate box.
- [ ] The offset slider can be moved with a thumb, not just a fingernail.

## Step 3 — Meter

- [ ] The instruction is clear enough that you would know what to do without
      being told.
- [ ] Tap the map: the meter marker lands where you tapped, not offset above it.
- [ ] Drag the meter. It follows the finger.
- [ ] Tap somewhere else — it moves, rather than adding a second marker.

## Step 4 — Design

This is the step the whole tool exists for. Take your time.

- [ ] The array appears on its own within a few seconds, on the property and
      not on the roof.
- [ ] **Without touching the sheet**: the four numbers on the map, the +/- and
      the button are all on screen at once, and the whole design can be done
      from there. Pulling the sheet up should never be necessary.
- [ ] The map HUD is not sitting on top of the array, at any zoom you land on.
- [ ] **Drag the array with one finger.** It moves, the map does not.
- [ ] **Pinch to zoom with two fingers.** The map zooms and the array stays put
      relative to the ground.
- [ ] Drag the array to the edge of the screen and let go. The camera reframes
      sensibly rather than losing it.
- [ ] **Turn the array with the compass grip.** It rotates smoothly, the grip
      stays under your finger, and the panel count does *not* change.
- [ ] **Let go** of the grip: the count re-sizes for the new heading and a
      toast says what changed and why. Nothing moves while your finger is down.
- [ ] Press **+** once, then turn the array. The count must not move, and an
      **Auto-size** chip appears. Tapping it hands the count back to the sizing
      maths for wherever the array is now pointing.
- [ ] The **S** button appears beside the grip. Tapping it turns the array back
      to south with a short ease — not a jump — the count returns to what it
      was, and the button disappears.
- [ ] The trench line follows the array and its "N ft" label stays legible.
- [ ] The compass grip does not sit on top of the array at any zoom.
- [ ] ± panel buttons are easy to hit with a thumb.
- [ ] If the slope chips appear, they are tappable and the selection sticks.
- [ ] **In sunlight**: array fill, trench line and meter marker are all
      distinguishable from the satellite image beneath.

## Desktop, briefly

- [ ] On a laptop, steps 2, 5 and 6 are **one centred column**, not a form
      squeezed beside an empty grey band. Steps 1, 3 and 4 keep the map.

## Step 5 — Options

- [ ] Only the options the owner has switched on appear (today: site prep).
- [ ] The cards show a price change, and choosing one changes the number by
      exactly that.

## Step 6 — Contact and submit

- [ ] The blurred price is obviously a price without being readable.
- [ ] Name, email and phone fields each bring up the right keyboard — email
      keyboard for email, number pad for phone.
- [ ] **With the keyboard up, the field you are typing in and the submit
      button are both visible.** Scroll if you have to; you should not have to.
- [ ] Submit. The button disables while it works.
- [ ] The price is revealed and it matches what the email says.
- [ ] **Check the inbox on the phone.** The email arrives, the logo loads, the
      numbers match the screen, and the Book a call link opens.
- [ ] Press back. It steps back through the funnel rather than leaving the page
      or reloading the whole thing.
- [ ] **Edge-swipe back** on iOS (swipe from the left edge). Same thing: a step
      back, not an exit.
- [ ] Reopen the URL: the design is still there and the contact fields are
      locked, with a Start over button.

## Whole-journey checks

- [ ] **Do it once without reading anything.** If you have to think about what
      to do next, that is the finding.
- [ ] Do it with the system font size turned up two notches. Nothing overlaps,
      nothing is cut off, no button becomes unreachable.
- [ ] **`100dvh` behaviour**: scroll down and up so the browser chrome hides and
      reappears. The sheet and the map should not leave a white gap or jump.
- [ ] With VoiceOver or TalkBack on, the step can be completed. Not perfect —
      completable.
- [ ] Turn off wifi mid-submit. It should queue and go when you reconnect,
      without filing a second lead.
- [ ] Embedded in an iframe on a partner page (`?source=` and `?brand=`), the
      whole thing still works and the back button behaves.

---

## What to write down

For anything that fails: the device, the OS version, the step, what you did,
what happened, and a screenshot or screen recording. "It felt slow" is a valid
finding — note where.
