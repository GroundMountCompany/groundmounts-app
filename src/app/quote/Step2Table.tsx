export default function Step2Table() {
  return (
    <div className='py-[80px]'>
      <h3 className='text-3xl leading-[41.6px] font-medium'>Solar Savings</h3>
      <p className='text-lg font-medium mt-4'>Save money on electricity. For example, if you pay $100/month now, you could save thousands over 30 years with solar.</p>
      <table className='w-full mt-6 border border-neutral-300 border-collapse'>
        <thead>
          <tr className='text-left'>
            <th className='border p-3'>EXISTING ELECTRIC BILL</th>
            <th className='border p-3'>10 YEAR COST</th>
            <th className='border p-3'>20 YEAR COST</th>
            <th className='border p-3'>30 YEAR COST</th>
          </tr>
        </thead>
        <tbody>
          <tr className='bg-[#F0F6FF]'>
            <td className='border p-3'>$50</td>
            <td className='border p-3'>$6,500</td>
            <td className='border p-3'>$6,500</td>
            <td className='border p-3'>$23,000</td>
          </tr>
          <tr>
            <td className='border p-3'>$100</td>
            <td className='border p-3'>$13,000</td>
            <td className='border p-3'>$29,000</td>
            <td className='border p-3'>$76,000</td>
          </tr>
          <tr className='bg-[#F0F6FF]'>
            <td className='border p-3'>$150</td>
            <td className='border p-3'>$19,000</td>
            <td className='border p-3'>$42,000</td>
            <td className='border p-3'>$70,000</td>
          </tr>
          <tr>
            <td className='border p-3'>$200</td>
            <td className='border p-3'>$26,000</td>
            <td className='border p-3'>$57,000</td>
            <td className='border p-3'>$85,000</td>
          </tr>
          <tr className='bg-[#F0F6FF]'>
            <td className='border p-3'>$250</td>
            <td className='border p-3'>$32,000</td>
            <td className='border p-3'>$71,000</td>
            <td className='border p-3'>$120,000</td>
          </tr>
        </tbody>
      </table>
      <p className='font-medium mt-6'>Assuming a 1.7% annual increase based on inflation and average annual electric rate increases.</p>
    </div>
  )
}
