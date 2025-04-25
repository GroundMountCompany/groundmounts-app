import Step4Summary from "./Step4Summary";


export default function Step4Form() {

  const renderCalendly = () => {
    if (typeof window === 'undefined' || !window) return null;
    return (
      <div className="relative left-0 top-0 lg:left-[-143px] lg:top-[-120px] w-full lg:w-[1000px] transform lg:scale-[0.8]">
        <div className="calendly-inline-widget" data-url={process.env.NEXT_PUBLIC_CALENDLY_URL} style={{width: '100%', height: '780px',}}></div>

        <script type="text/javascript" src="https://assets.calendly.com/assets/external/widget.js" async></script>
      </div>
    )
  }

  return (
    <>

      <div className="lg:hidden block mb-10">
        <Step4Summary />
      </div>

      <div className="flex flex-col mt-10 lg:mt-[80px]">
        {renderCalendly()}
      </div>
    </>
  )
}
