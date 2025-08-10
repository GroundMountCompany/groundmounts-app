export enum QuoteStep {
  Address = 0,
  MeterIntro = 1,
  MeterMap = 2,
  EnergyCalcs = 3,
}

export const TAB_NAME = {
  EMAIL: 'email',
  QUOTATION: 'quotation',
  QUIZ: 'quiz',
}

export const SPREADSHEET_ID = process.env.NEXT_PUBLIC_SPREADSHEET_ID!;