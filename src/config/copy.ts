/**
 * Every word the customer reads.
 *
 * Voice: a contractor who knows his trade explaining it to a neighbour. Short
 * sentences. No selling. The banned-word list below is enforced by a unit test,
 * so marketing language cannot creep back in one commit at a time.
 */

export interface EducationCopy {
  /** The single line shown by default. */
  why: string;
  /** Shown when "Learn more" is expanded. */
  more: string;
}

export interface StepCopy {
  /** Short label for the progress row. */
  label: string;
  /** Heading at the top of the sheet. */
  title: string;
  /** One line under the heading. */
  intro: string;
  /** Label on the primary button. */
  cta: string;
  education: EducationCopy;
}

export const STEPS: StepCopy[] = [
  {
    label: 'Property',
    title: 'Find your property',
    intro: 'Type your address, then drag the pin onto your land.',
    cta: 'This is the spot',
    education: {
      why: 'We need the exact spot to measure sun, slope and cable run.',
      more:
        'Satellite view is usually a year or two old, so trust your own eyes over the picture. ' +
        'Put the pin where the panels would go, not on the mailbox. If the roof looks wrong, ' +
        'drag the pin anyway — the coordinates are what we use.',
    },
  },
  {
    label: 'Power',
    title: 'Your power use',
    intro: 'Two numbers off your electric bill and we can size the system.',
    cta: 'Next',
    education: {
      why: 'Your bill tells us how much power you burn in a year.',
      more:
        'Use an average month, not your worst August. If you only know the dollar amount, that ' +
        'is enough — we work backwards from the rate. Covering 100% of your use is the common ' +
        'choice, but plenty of people cover less and keep the system smaller.',
    },
  },
  {
    label: 'Meter',
    title: 'Your meter',
    intro: 'Tap the map where your electric meter sits. Drag it to adjust.',
    cta: 'Meter is placed',
    education: {
      why: 'The trench runs from the panels to your meter, so its spot sets the cable cost.',
      more:
        'It is the grey box with a glass dome or a digital readout, usually on an outside wall ' +
        'or a pole near the house. If you have more than one, pick the one the power company ' +
        'reads. Being off by a few feet is fine.',
    },
  },
  {
    label: 'Design',
    title: 'Design your array',
    intro: 'Drag the panels where you want them. Turn them with the compass.',
    cta: 'This design works',
    education: {
      why: 'South makes the most power in Texas. You can face it another way if your land needs it.',
      more:
        'Keep the panels off low ground that holds water and away from anything that shades ' +
        'them in winter, when the sun sits low. A longer trench costs more, so closer to the ' +
        'meter is cheaper — but a good sunny spot is worth more than a short cable run.',
    },
  },
  {
    label: 'Options',
    title: 'Options',
    intro: 'A few choices that change the price.',
    cta: 'Next',
    education: {
      why: 'These are the decisions that move the number the most.',
      more:
        'Batteries keep the lights on when the grid drops, which in Texas is worth thinking ' +
        'about. Better panels make more power in the same footprint. Clearing brush is labour ' +
        'we can price once we see it.',
    },
  },
  {
    label: 'Quote',
    title: 'Get your number',
    intro: 'Where should we send it?',
    cta: 'Unlock your price',
    education: {
      why: 'This is an estimate from your design, not a final bid.',
      more:
        'The real number comes after somebody stands on your land and looks at the soil, the ' +
        'slope and the panel run. This gets you within range so you know whether to keep ' +
        'talking. No obligation and we do not sell your details.',
    },
  },
];

/** Option cards on step 5. Prices arrive with the pricing engine. */
export const OPTION_CARDS = [
  {
    key: 'panels',
    title: 'Panels',
    body: 'Standard or premium. Premium makes more power in the same footprint.',
  },
  {
    key: 'battery',
    title: 'Battery',
    body: 'Keeps your lights on when the grid goes down. None, one or two.',
  },
  {
    key: 'siteprep',
    title: 'Site prep',
    body: 'Is the spot clear, or does it need brush and trees taken out?',
  },
] as const;

/** What a meter looks like, on step 3. */
export const METER_EXAMPLES = [
  { src: '/images/meter-img.PNG', label: 'On a wall' },
  { src: '/images/meter-img2.PNG', label: 'On a pole' },
] as const;

export const UI = {
  findPanels: 'Find my panels',
  learnMore: 'Learn more',
  showLess: 'Show less',
  back: 'Back',
  billUploadStub: 'Upload a photo of your bill',
  billUploadNote: 'Coming next. Type your numbers in for now.',
  monthlyBill: 'Average monthly bill',
  ratePerKwh: 'Price per kWh',
  offset: 'How much of your power should solar cover?',
  panels: 'Panels',
  systemSize: 'System size',
  footprint: 'Footprint',
  production: 'Est. production',
  trench: 'Trench',
  facing: 'Facing',
  slope: 'Slope',
  addPanel: 'Add a panel',
  removePanel: 'Remove a panel',
  priceHidden: 'Your price range',
  successTitle: 'On its way',
  successBody: 'Check your email. If you want to talk it through, book a time below.',
  bookCall: 'Book a call',

  // Step 2
  ratePerKwhHint: 'Look for "price per kWh" on your bill. Leave it be if you are not sure.',
  annualTargetPrefix: 'That is about',
  annualTargetSuffix: 'a year to cover.',
  offsetSliderLabel: 'Offset percentage',

  // Step 3
  meterTapPrompt: 'Tap the map where your meter sits.',
  meterPlaced: 'Meter placed. Drag it if it is off.',

  // Step 4
  optionPriceLater: 'Pricing for this comes next.',
  trenchNote: 'We route the trench around anything in the way once we are on site.',
  slopeChecking: 'checking',

  // Step 6
  summaryPanels: 'Panels',
  summarySystem: 'System',
  summaryProduction: 'Production',
  summaryTrench: 'Trench',
  fieldName: 'Name',
  fieldEmail: 'Email',
  fieldPhone: 'Phone',
  namePlaceholder: 'John Smith',
  emailPlaceholder: 'you@example.com',
  phonePlaceholder: '(555) 555-5555',
  submitting: 'Sending',
  submitFailed: 'Did not go through. Try again.',
  emailFailedAfterSave: 'Your design is saved. The email did not send — try again.',

  // Shell
  sheetLabel: 'Controls',
  sheetHandleLabel: 'Resize controls',
  progressLabel: 'Progress',
  progressNotYet: ' (not yet)',
  rotateHandle: 'Turn',
  /** Placeholder digits behind the blur. Not a real number. */
  pricePlaceholder: '$00,000 – $00,000',
  errorBoundary: 'Something went wrong. Refresh and try again.',
  addressPlaceholder: 'Enter your address',
} as const;

/**
 * Words that mean nothing to a landowner in Texas. Enforced by a unit test over
 * every string in this file.
 *
 * "unlock" is allowed only as the button label on the final step, which is the
 * one exception the brief carves out.
 */
export const BANNED_WORDS = [
  'leverage',
  'comprehensive',
  'solutions',
  'cutting-edge',
  'game-changer',
  'revolutionary',
  'seamless',
  'delve',
  'landscape',
  'multifaceted',
  'pivotal',
  'foster',
  'robust',
  'synergy',
  'ecosystem',
  'holistic',
  'paradigm',
  'journey',
  'empower',
] as const;

export const BANNED_OPENINGS = [
  "in today's world",
  'it is important to note',
  "it's important to note",
  'let us dive in',
  "let's dive in",
] as const;
