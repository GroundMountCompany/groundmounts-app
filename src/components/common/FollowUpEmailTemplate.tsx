import * as React from 'react';
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Tailwind,
  Row,
  Column,
} from '@react-email/components';

interface FollowUpEmailTemplateProps {
  client: string;
  phone?: string;
  systemType?: string;
  address?: string;
  materials?: string;
  coordinates?: string;
  estimatedCost?: string;
  installationTimeline?: string;
  trenching?: string;
  totalCost?: string;
  date?: string;
  calendlyUrl?: string;
}

interface BodyStyle {
  fontFamily: string;
  margin: number;
}

const baseUrl: string = process.env.NEXT_PUBLIC_VERCEL_URL || "https://ground-mounts-app.vercel.app";

export default function FollowUpEmailTemplate({
  client = "John",
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  phone: _phone = "Not provided",
  systemType = "Ground Mount Solar System",
  address = "Tailored for your home&apos;s energy needs",
  materials = "Premium-quality, durable components",
  estimatedCost = "More affordable than traditional electricity",
  installationTimeline = "3 Days after Site Survey",
  trenching = "50 years",
  coordinates,
  totalCost,
  date,
  calendlyUrl,
}: FollowUpEmailTemplateProps): React.JSX.Element {
  const body: BodyStyle = {
    fontFamily: "'Manrope', 'Helvetica', 'Arial', sans-serif",
    margin: 0
  }
  return (
    <Html>
      <Head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap" />
      </Head>
      <Preview>Your ground mount quote is ready - let&apos;s discuss next steps</Preview>
      <Tailwind>
        <Body style={body}>
          <Container className="bg-[#002868] w-full max-w-[656px]">
            <Section className='p-10 bg-white'>
              <div className='text-[16px] leading-[24px] text-left font-bold text-[#183776] my-0'>
                Hi {client},
              </div>
              <div className='text-[16px] leading-[24px] text-left font-normal text-[#46586B] mt-6 mb-0'>
                I hope you&apos;ve had a chance to review your custom ground-mounted solar quote from earlier today. 
                I wanted to follow up and see if you have any questions about the system we designed for your property.
              </div>
              <div className='text-[16px] leading-[24px] text-left font-normal text-[#46586B] mt-4 mb-0'>
                Your {materials} system is designed to provide significant energy savings while maximizing
                the efficiency of your open land. At {estimatedCost}, this turnkey installation is ready to start saving you money.
              </div>
            </Section>
            
            <div className="flex justify-center mt-10">
              <a href={calendlyUrl} target='_blank' className='flex gap-2 justify-center items-center btn bg-blue-600 text-white px-4 py-2 rounded rounded-sm text-xl mx-auto text-decoration-none border-radius-4' style={{textDecoration: "none", fontSize: "26px", borderRadius: "20px"}}>
                <span className='text-white'>&#128241;</span> Schedule Your Free Consultation
              </a>
            </div>

            <Section className='p-[32px]'>
              <Section className='py-6 px-5 bg-white rounded-[12px]'>
                <Row>
                  <div className='text-[16px] leading-[24px] text-left tracking-[-0.02em] font-bold text-[#183776] !my-0'>
                    Here&apos;s a quick reminder of your custom quote details:
                  </div>
                </Row>
                <Row>
                  <Column className='w-1/2 relative'>
                    <div className='text-[16px] leading-[24px] text-left font-normal text-[#46586B] mt-6 mb-0 absolute top-0 left-0'>System Type</div>
                  </Column>
                  <Column className='w-1/2'>
                    <div className='text-[16px] leading-[24px] tracking-[-0.02em] text-left font-bold text-[#183776] mt-6 mb-0'>{systemType}</div>
                  </Column>
                </Row>
                <Row>
                  <Column className='w-1/2 relative'>
                    <div className='text-[16px] leading-[24px] text-left font-normal text-[#46586B] mt-6 mb-0 absolute top-0 left-0'>Address:</div>
                  </Column>
                  <Column className='w-1/2'>
                    <div className='text-[16px] leading-[24px] tracking-[-0.02em] text-left font-bold text-[#183776] mt-6 mb-0'>{address}</div>
                  </Column>
                </Row>
                <Row>
                  <Column className='w-1/2 relative'>
                    <div className='text-[16px] leading-[24px] text-left font-normal text-[#46586B] mt-6 mb-0 absolute top-0 left-0'>Materials:</div>
                  </Column>
                  <Column className='w-1/2'>
                    <div className='text-[16px] leading-[24px] tracking-[-0.02em] text-left font-bold text-[#183776] mt-6 mb-0'>{materials}</div>
                  </Column>
                </Row>
                <Row>
                  <Column className='w-1/2 relative'>
                    <div className='text-[16px] leading-[24px] text-left font-normal text-[#46586B] mt-6 mb-0 absolute top-0 left-0'>Coordinates:</div>
                  </Column>
                  <Column className='w-1/2'>
                    <div className='text-[16px] leading-[24px] tracking-[-0.02em] text-left font-bold text-[#183776] mt-6 mb-0'>{coordinates}</div>
                  </Column>
                </Row>
                <Row>
                  <Column className='w-1/2 relative'>
                    <div className='text-[16px] leading-[24px] text-left font-normal text-[#46586B] mt-6 mb-0 absolute top-0 left-0'>Trenching Cost:</div>
                  </Column>
                  <Column className='w-1/2'>
                    <div className='text-[16px] leading-[24px] tracking-[-0.02em] text-left font-bold text-[#183776] mt-6 mb-0'>{trenching}</div>
                  </Column>
                </Row>
                <Row>
                  <Column className='w-1/2 relative'>
                    <div className='text-[16px] leading-[24px] text-left font-normal text-[#46586B] mt-6 mb-0 absolute top-0 left-0'>Estimated Cost:</div>
                  </Column>
                  <Column className='w-1/2'>
                    <div className='text-[16px] leading-[24px] tracking-[-0.02em] text-left font-bold text-[#183776] mt-6 mb-0'>{estimatedCost}</div>
                  </Column>
                </Row>
                <Row>
                  <Column className='w-1/2 relative'>
                    <div className='text-[16px] leading-[24px] text-left font-normal text-[#46586B] mt-6 mb-0 absolute top-0 left-0'>Total Cost:</div>
                  </Column>
                  <Column className='w-1/2'>
                    <div className='text-[16px] leading-[24px] tracking-[-0.02em] text-left font-bold text-[#183776] mt-6 mb-0'>{totalCost}</div>
                  </Column>
                </Row>
                <Row>
                  <Column className='w-1/2 relative'>
                    <div className='text-[16px] leading-[24px] text-left font-normal text-[#46586B] mt-6 mb-0 absolute top-0 left-0'>Date:</div>
                  </Column>
                  <Column className='w-1/2'>
                    <div className='text-[16px] leading-[24px] tracking-[-0.02em] text-left font-bold text-[#183776] mt-6 mb-0'>{date}</div>
                  </Column>
                </Row>
                <Row>
                  <Column className='w-1/2 relative'>
                    <div className='text-[16px] leading-[24px] text-left font-normal text-[#46586B] mt-6 mb-0 absolute top-0 left-0'>Installation Timeline:</div>
                  </Column>
                  <Column className='w-1/2'>
                    <div className='text-[16px] leading-[24px] tracking-[-0.02em] text-left font-bold text-[#183776] mt-6 mb-0'>{installationTimeline}</div>
                  </Column>
                </Row>
                
                <Section className='bg-[#D5F1FC66] rounded-[12px] p-4 mt-10'>
                  <div className='text-[16px] leading-[24px] tracking-[-0.02em] text-left font-bold text-[#183776] flex items-center'>
                    <Img src={`${baseUrl}/images/bulb.png`} alt="Next Steps" width={24} height={24} className='inline-block mr-2' />
                   <div className='mt-[-4px] inline-block'> Next Steps:</div>
                  </div>
                  <div className='text-[16px] leading-[24px] tracking-[-0.02em] text-left font-normal text-[#46586B] mt-6 mb-0'>
                    Ready to move forward? Schedule a free 30-minute consultation to discuss your specific needs, 
                    answer any questions, and walk through the installation timeline. No pressure - just helpful information.
                  </div>
                </Section>
              </Section>
            </Section>
            
            <Img src={`${baseUrl}/images/logo-email-white.png`} alt="logo white" width={135.54} height={33.55} className='w-[135.54px] h-[33.55px] mx-auto mt-8 mb-[30.85px]' />
            <div className="text-[24px] leading-[36px] text-center font-normal text-white w-[75%] mx-auto">Your custom ground-mounted solar energy system</div>
            <Row className='mb-5'>
              <Column className='w-1/2'>
                <Img src={`${baseUrl}/images/email-left.png`} alt="left image" width={135.54} height={33.55} className='h-[250px] w-auto' />
              </Column>
              <Column className='w-1/2 text-right'>
                <Img src={`${baseUrl}/images/email-right.png`} alt="right image" width={135.54} height={33.55} className='inline-block h-[250px] w-auto' />
              </Column>
            </Row>
            <Hr className='!border-white opacity-[0.12] my-0' />
            <Section className='text-center text-[12px] leading-[18px] font-normal text-white pt-[33px] pb-[40px] px-[20px]'>
              <div className='mb-2 w-[90%] mx-auto'>Questions or concerns? Get in touch with us at <Link href="mailto:info@groundmounts.com" className='text-white font-extrabold'>info@groundmounts.com.</Link></div>
              <div className='mb-6 w-[90%] mx-auto'>Never miss a beat! Follow us on <Link href="https://www.youtube.com/channel/UCfvcBjN1jER6Wer4vPAjvhA" className='text-white font-extrabold'>Youtube</Link> and <Link href="https://www.facebook.com/profile.php?id=61572574884731" className='text-white font-extrabold'>Facebook</Link></div>
            </Section>
            <Hr className='!border-white opacity-[0.12] my-0' />
            <Section className='text-center py-[20px]'>
              <div className='text-[10px] leading-[15px] text-left font-normal text-white inline-block opacity-[0.5]'>Copyright © 2024 The Ground Mount Company</div>
            </Section>
          </Container>
          <Container>
            <div className="flex justify-center mt-10">
              <a href={calendlyUrl} target='_blank' className='flex gap-2 justify-center items-center btn bg-blue-600 text-white px-4 py-2 rounded rounded-sm text-xxl mx-auto text-decoration-none border-radius-4' style={{textDecoration: "none", fontSize: "44px", borderRadius: "20px"}}>
                <span className='text-white'>&#128241;</span> Schedule Your Free Consultation
              </a>
            </div>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
} 