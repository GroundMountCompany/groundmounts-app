# Solar Quote Calculator: How We Calculate Your System Cost

This document explains how our solar quote calculator determines the cost of your solar system in everyday terms, with references to the relevant code.

## Overview of the Calculation Process

Our solar quote calculator follows these steps to determine your system cost:

1. Collect information about your electricity usage
2. Calculate how much electricity you want to offset with solar
3. Determine how many solar panels you need
4. Calculate any additional costs (like trenching to your electrical meter)
5. Apply available tax credits
6. Present payment options (cash or financing)

## Detailed Calculation Steps

### Step 1: Understanding Your Electricity Usage
- We ask for your average monthly electric bill (e.g., $200/month)
- We also ask for your highest monthly bill for reference
- We multiply your average bill by 12 to get your yearly electricity cost

**Code Reference:** [Step2Form.tsx](../src/app/quote/Step2Form.tsx)
```javascript
const yearlyCost: number = avgValue * 12;
```

### Step 2: Deciding How Much to Offset
- You choose what percentage of your bill you want to eliminate with solar (using a slider)
- If you select 50%, we'll design a system to cover half your electricity usage
- If you select 100%, we'll cover your entire bill
- You can even go up to 150% if you expect increased usage in the future

**Code Reference:** [Step2Form.tsx](../src/app/quote/Step2Form.tsx)
```javascript
const savedYearlyCost: number = yearlyCost * percentage / 100;
```

### Step 3: Converting Cost to Energy Needs
- We know the average electricity rate is $0.18 per kilowatt-hour (kWh)
- We calculate how many kWh you need to offset annually:
  - Monthly consumption = Monthly bill ÷ Rate per kWh
  - Example: $200 ÷ $0.18 = 1,111 kWh per month
  - Yearly consumption = Monthly consumption × 12
  - Example: 1,111 × 12 = 13,333 kWh per year

**Code Reference:** [Step2Form.tsx](../src/app/quote/Step2Form.tsx)
```javascript
const perKwhRate: number = 0.18;
const monthlyConsumption: number = monthlyBill / perKwhRate;
const yearlyConsumption: number = monthlyConsumption * 12;
```

### Step 4: Determining Panel Count
- Each solar panel produces about 583 kWh per year
- We divide your energy needs by what each panel produces
  - Example: 13,333 kWh ÷ 583 kWh = 23 panels
  - We round to the nearest layout-friendly number (e.g., 24 for a 4×6 array)
- Each panel has a rating of 400 Watts

**Code Reference:** [Step2Form.tsx](../src/app/quote/Step2Form.tsx)
```javascript
const solarKwhPerPanel: number = 583;
const panelWattage: number = 400;
const totalPanelsNeeded: number = yearlyConsumption / solarKwhPerPanel;
setTotalPanels(Math.ceil(totalPanelsNeeded));
```

### Step 5: Calculating System Cost
- System size in Watts = Number of panels × Panel wattage
  - Example: 24 panels × 400 Watts = 9,600 Watts (9.6 kW)
- Base cost = System size in Watts × $3.50
  - Example: 9,600 × $3.50 = $33,600

**Code Reference:** [Step2Form.tsx](../src/app/quote/Step2Form.tsx)
```javascript
const costPerWatt: number = 3.50;
const systemSizeWatts: number = totalPanels * panelWattage;
const baseQuotation: number = systemSizeWatts * costPerWatt;
```

### Step 6: Calculating Trenching Costs
- We need to connect your solar panels to your electrical meter
- You mark your meter location on a map
- We calculate the distance in feet between your panels and meter
- Each foot of trenching costs $45
  - Example: 30 feet × $45 = $1,350 additional cost

**Code Reference:** [quoteContextProvider.tsx](../src/contexts/quoteContextProvider.tsx)
```javascript
const COST_PER_FOOT = 45;
const additionalCost = distanceInFeet * COST_PER_FOOT;
```

### Step 7: Calculating Total System Cost
- We add the base quotation and the trenching costs to get your total system cost

**Code Reference:** [Step3Content.tsx](../src/app/quote/Step3Content.tsx)
```javascript
const totalCost = useMemo(() => quotation + (additionalCost || 0), [quotation, additionalCost]);
```

### Step 8: Calculating Federal Tax Credit
- The federal government offers a 30% tax credit on solar installations
- We calculate this credit based on your total system cost

**Code Reference:** [Step3Content.tsx](../src/app/quote/Step3Content.tsx)
```javascript
const federalTaxCreditCash = useMemo(() => Math.floor(totalCost * 0.3), [totalCost]);
const federalTaxCreditMonthly = useMemo(() => Math.floor((totalCost / 12) * 0.3), [totalCost]);
```

## Payment Options

### Cash Payment Option
- **Total System Cost:** Base quotation + Trenching costs
- **Payment Schedule:**
  - 25% deposit to secure your order
  - 50% before installation day
  - 25% after installation is complete
- **Federal Tax Credit:** 30% of your total system cost (applied after installation)

**Code Reference:** [Step3Content.tsx](../src/app/quote/Step3Content.tsx)
```javascript
<div className="flex justify-between border-b border-neutral-200 font-medium py-[18px]">
  <p className="w-[200px] lg:w-[400px]">Start With A 25% Deposit To Secure Your Order</p>
  <p className="text-custom-primary">${Math.floor(totalCost * 0.25).toLocaleString()}</p>
</div>
```

### Financing Option ($0-Down)
- **Base Monthly Payment:** $687 per month
- **Additional Monthly Cost:** Trenching cost spread over 12 months
- **Total Monthly Payment:** Base payment + Additional monthly cost
- **Monthly Tax Credit:** 30% of your monthly payment (applied as a credit)

**Code Reference:** [Step3Content.tsx](../src/app/quote/Step3Content.tsx)
```javascript
const baseMonthlyPayment = 687; // Base monthly payment from design
const monthlyPaymentWithDistance = useMemo(() => {
  const additionalMonthly = additionalCost ? Math.floor(additionalCost / 12) : 0;
  return baseMonthlyPayment + additionalMonthly;
}, [additionalCost]);
```

## Example Calculation

Let's say:
- Your average monthly bill is $200
- You want to offset 100% of your usage
- Your electrical meter is 30 feet from the panels

Here's how we'd calculate your quote:

1. **Monthly consumption**: $200 ÷ $0.18 = 1,111 kWh
2. **Yearly consumption**: 1,111 × 12 = 13,333 kWh
3. **Panels needed**: 13,333 ÷ 583 = 23 panels (rounded to 24)
4. **System size**: 24 panels × 400 Watts = 9,600 Watts (9.6 kW)
5. **Base system cost**: 9,600 × $3.50 = $33,600
6. **Trenching cost**: 30 feet × $45 = $1,350
7. **Total system cost**: $33,600 + $1,350 = $34,950
8. **Federal tax credit**: $34,950 × 30% = $10,485
9. **Net cost (cash option)**: $34,950 - $10,485 = $24,465

## Notes on Rounding

All calculations in our system use `Math.floor()` to round down to the nearest whole number, ensuring conservative estimates for the customer.

**Code Reference:** [Step3Content.tsx](../src/app/quote/Step3Content.tsx)
```javascript
const federalTaxCreditCash = useMemo(() => Math.floor(totalCost * 0.3), [totalCost]);
```

---

This document provides a general overview of our calculation process. The actual implementation may include additional factors and optimizations.
