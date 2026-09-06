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

/** Option cards on step 5. */
/**
 * The four questions on the options step, in the order they are asked.
 *
 * Ground first, because it is what the customer can see out of the window and
 * what moves the number. The battery question is last and is not priced: it is
 * a conversation to have on the phone, not a checkbox on a ballpark.
 */
export const OPTION_CARDS = [
  {
    key: 'siteprep',
    title: 'Land clearing',
    body: 'Is the spot clear, or does it need brush and trees taken out?',
  },
  {
    key: 'slope',
    title: 'Slope',
    body: "How's the ground where the panels go?",
  },
  {
    key: 'soil',
    title: 'Soil',
    body: 'Is the ground rocky?',
  },
  {
    key: 'battery',
    title: 'Battery and generator',
    body: 'Would you like to hear about battery and generator options?',
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
  billUpload: 'Upload a photo of your bill',
  billUploadNote: 'Or type your numbers in below.',
  billTakePhoto: 'Take a photo',
  billTakePhotoNote: 'Opens the camera.',
  billChooseFile: 'Choose a photo or PDF',
  billChooseFileNote: 'From your photo library or files.',
  billReading: 'Reading your bill...',
  billReadingNote: 'This usually takes about 20 seconds.',
  billReadingProgressLabel: 'Reading your bill',
  billThumbAlt: 'The bill you chose',
  billPdfLabel: 'PDF',
  billGotIt: 'Got it —',
  billFoundMonths: 'months found',
  billFoundMonth: 'month found —',
  billFoundScaled: "we'll scale it to a year",
  billFailedShort: "Couldn't read that one",
  billFailed: "Couldn't read that one. Type it in instead.",
  billMonthsTitle: 'What we read',
  billMonthsNote: 'Check these against your bill and fix anything that is wrong.',
  billMonthsUse: 'Use these numbers',
  billConfirmed: 'Using the numbers from your bill.',
  billEditAgain: 'Change',
  billMonthsDiscard: 'Start over',
  billMonthHeader: 'Period',
  billCostHeader: 'Cost',
  billKwhHeader: 'kWh',
  billNoCost: '—',
  billRateLabel: 'Your rate (cents per kWh)',
  billRatePlaceholder: '14',
  billScaledNote: 'Scaled to a full year from the months you gave us.',
  billAnnualPrefix: 'That is',
  billAnnualSuffix: 'a year.',
  monthlyBill: 'Average monthly bill',
  monthlyBillHint: 'Whole dollars is fine.',
  ratePerKwh: 'Your rate (cents per kWh)',
  offset: 'How much of your power should solar cover?',
  panels: 'Panels',
  hudLabel: 'Your system so far',
  hudPanels: 'panels',
  hudKw: 'kW',
  hudTrench: 'ft trench',
  hudProduction: 'kWh/yr',
  faceSouth: 'Face south',
  autoSize: 'Auto-size',
  autoSizeHint: 'You set the count by hand, so turning the array leaves it alone.',

  // The toast after an automatic resize. Assembled rather than one string, so
  // the direction and the number can vary without a template language.
  sizeBackToSouth: 'Back to south',
  sizeFacing: 'Facing',
  sizeAdded: 'added',
  sizeRemoved: 'removed',
  sizePanels: 'panels',
  sizePanel: 'panel',
  sizeToKeepYouAt: 'to keep you at',
  compassNorth: 'north',
  compassNortheast: 'northeast',
  compassEast: 'east',
  compassSoutheast: 'southeast',
  compassSouth: 'south',
  compassSouthwest: 'southwest',
  compassWest: 'west',
  compassNorthwest: 'northwest',

  // Abbreviations for the HUD line, which shares a row with four figures and
  // has no room for "southwest".
  compassShortNorth: 'N',
  compassShortNortheast: 'NE',
  compassShortEast: 'E',
  compassShortSoutheast: 'SE',
  compassShortSouth: 'S',
  compassShortSouthwest: 'SW',
  compassShortWest: 'W',
  compassShortNorthwest: 'NW',

  /*
    The standing line on the HUD, for as long as the array is off south.

    The toast says what just changed and goes. This says what the array is
    still doing, and stays until it is back at 180 — owner QA: a toast alone
    was missable, and once it had gone there was nothing on screen explaining
    why the count was what it was.
  */
  hudFacing: 'Facing',
  hudMorePanels: 'more panels than south',
  hudFewerPanels: 'fewer panels than south',
  /** The 48px button is too small for the phrase; the label carries it. */
  faceSouthShort: 'S',
  systemSize: 'System size',
  footprint: 'Footprint',
  production: 'Est. production',
  trench: 'Trench',
  facing: 'Facing',
  slope: 'Slope',
  addPanel: 'Add a panel',
  removePanel: 'Remove a panel',
  priceHidden: 'Your price range',
  estimateNote: 'Estimates — final price after site visit',
  successTitle: 'On its way',
  successBody: 'Check your email. If you want to talk it through, book a time below.',
  bookCall: 'Book a call',

  // Step 2
  ratePerKwhHint:
    'On your bill, look for cents per kWh. Most of Texas runs 12 to 18. Leave it be if you are not sure.',
  rateOutOfRange: 'That is unusual for Texas. Worth a second look at your bill.',
  annualTargetPrefix: 'That is about',
  annualTargetSuffix: 'a year to cover.',
  offsetSliderLabel: 'Offset percentage',
  /** An ordinary Texas bill, shown greyed so the box does not look empty. */
  billPlaceholder: '240',

  // Step 3
  meterTapPrompt: 'Tap the map where your meter sits.',
  meterPlaced: 'Meter placed. Drag it if it is off.',

  // Step 4
  slopeAsk: 'We could not read the ground here. Which is closest?',
  slopeFlat: 'Flat',
  slopeRolling: 'Rolling',
  slopeSteep: 'Steep',
  slopeAskHint: 'Steeper ground takes more grading and longer piles.',
  tierStandard: 'Standard',
  tierPremium: 'Premium',
  batteryNone: 'None',
  batteryOne: 'One',
  batteryTwo: 'Two',
  clearingNo: 'It is clear',
  clearingYes: 'Needs clearing',

  // Step 5, the ground questions.
  slopeAnswerFlat: 'Flat',
  slopeAnswerSlight: 'Slight slope',
  slopeAnswerBig: 'Big slope',
  rockyNo: 'Not rocky',
  rockyYes: 'Rocky',
  rockySurveyNote: 'We checked the soil survey — looks rocky here.',
  batteryInterestYes: 'Yes',
  batteryInterestNo: 'No',
  batteryInterestNote: 'No charge either way. We will talk it through on the call.',
  included: 'Included',
  priceRangeLabel: 'Your range',
  lineItemsTitle: 'What that covers',

  /*
    Step 6, after the number is revealed.

    Plain and flat. The chart is the argument; the words around it should not
    try to help it along.
  */
  resultsTitle: 'What it costs to do nothing',
  resultsIntro:
    'The utility raises its rates. You can move the number below to whatever you think is right.',
  resultsChartLabel: '25 years of monthly cost',
  resultsWithout: 'Without solar',
  resultsWith: 'With this system',
  resultsCrossover: 'They cross here',
  resultsInflationLabel: 'Utility rate rise each year',
  resultsPaysForItself: 'Pays for itself in year',
  resultsNoPayback: "At this rate it doesn't pay for itself in 25 years.",
  resultsUtilityTotal: '25 years of utility bills',
  resultsSystemTotal: 'This system',
  resultsYear25Prefix: 'In',
  resultsYear25Middle: 'at this rate your bill is',
  resultsYear25With: 'a month. With this system:',
  resultsYear25Suffix: 'a month.',
  resultsPerMonth: '/month',
  resultsAssumptionsTitle: 'Our assumptions',
  resultsAssumptionBill: 'Your monthly bill, as you entered it',
  resultsAssumptionOffset: 'Share of your power this array covers',
  resultsAssumptionInflation: 'Utility rate rise each year',
  resultsAssumptionDegradation: 'Panel output lost each year',
  resultsAssumptionHorizon: 'Years compared',
  resultsAssumptionPrice: 'System price, spread evenly over those years',
  resultsAssumptionFinancing: 'Financing',
  resultsAssumptionNoFinancing: 'None. This is arithmetic, not a loan.',
  trenchNote: 'We route the trench around anything in the way once we are on site.',
  slopeChecking: 'checking',
  soilLabel: 'Soil',

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
  lockedContactNote: 'These are on file with your design.',
  startOver: 'Not you? Start over',
  designLocked: 'Start over to change your design',

  // Shell
  sheetLabel: 'Controls',
  sheetHandleLabel: 'Resize controls',
  progressLabel: 'Progress',
  progressNotYet: ' (not yet)',
  rotateHandle: 'Turn',
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
  // Nothing in this funnel may imply a credit or a rebate. The owner does not
  // control whether a given customer qualifies for one, and a number quoted
  // net of something they turn out not to get is a number that was wrong.
  'tax credit',
  'itc',
  '30%',
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
