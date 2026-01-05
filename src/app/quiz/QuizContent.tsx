'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { v4 as uuidv4 } from 'uuid';

interface QuizData {
  userId: string;
  state: string;
  solarMotivation: string;
  successCriteria: string;
  decisionMaker: string;
}

export default function QuizContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const state = searchParams.get('state') || '';

  const [currentStep, setCurrentStep] = useState(0);
  const [quizData, setQuizData] = useState<QuizData>(() => {
    // Initialize with a new or existing userId
    let userId = '';
    if (typeof window !== 'undefined') {
      userId = localStorage.getItem('solar_quiz_user_id') || uuidv4();
      localStorage.setItem('solar_quiz_user_id', userId);
    }
    
    return {
      userId,
      state: state,
      solarMotivation: '',
      successCriteria: '',
      decisionMaker: ''
    };
  });

  // Ensure userId is set even after page refresh (intentionally runs once on mount)
  useEffect(() => {
    if (!quizData.userId) {
      const userId = uuidv4();
      localStorage.setItem('solar_quiz_user_id', userId);
      setQuizData(prev => ({ ...prev, userId }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // useEffect(() => {
  //   // Check for existing leadId in local storage
  //   let leadId = '';
  //   if (typeof window !== 'undefined') {
  //     leadId = localStorage.getItem('lead_id') || '';
  //     if (!leadId) {
  //       const timestamp = new Date().getTime();
  //       const randomNum = Math.floor(Math.random() * 1000000);
  //       leadId = `LEAD_${timestamp}_${randomNum}`;
  //       localStorage.setItem('lead_id', leadId);
  //     }
  //   }

  //   // Send leadId and quiz data to the submit API
  //   const updateSheetWithLeadId = async () => {
  //     try {
  //       const response = await fetch('/api/submit', {
  //         method: 'POST',
  //         headers: {
  //           'Content-Type': 'application/json',
  //         },
  //         body: JSON.stringify({ tabName: 'Sheet1', leadId }),
  //       });

  //       if (!response.ok) {
  //         throw new Error('Failed to update sheet with leadId');
  //       }
  //     } catch (error) {
  //       console.error('Error updating sheet with leadId:', error);
  //     }
  //   };
    
  //   updateSheetWithLeadId();
  // }, []);

  const questions = [
    {
      title: "What matters most to you about going solar?",
      options: [
        "Saving money on electricity bills",
        "Environmental impact",
        "Energy independence",
        "Increasing home value",
        "Protection against rising energy costs"
      ],
      field: 'solarMotivation'
    },
    {
      title: "What would make this solar project a success for you?",
      options: [
        "Maximum energy savings",
        "Quick installation process",
        "Minimal upfront costs",
        "Aesthetic integration with home",
        "Reliable long-term performance"
      ],
      field: 'successCriteria'
    },
    {
      title: "Whose decision is this?",
      options: [
        "Individual decision",
        "Joint decision with spouse/partner",
        "Family decision",
        "Need to consult with others",
        "Business decision"
      ],
      field: 'decisionMaker'
    }
  ];

  const handleQuizAnswer = (value: string) => {
    // Update local quiz data
    const field = questions[currentStep].field;
    setQuizData(prev => ({ ...prev, [field]: value }));

    // Move to next question or redirect
    if (currentStep < questions.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      router.push('/quote');
    }
  };

  const fadeInUp = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <motion.div 
        className="w-full max-w-3xl p-6"
        key={currentStep}
        {...fadeInUp}
        transition={{ duration: 0.5 }}
      >
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Progress indicator */}
          <div className="flex justify-between mb-8">
            {questions.map((_, index) => (
              <div
                key={index}
                className={`h-2 flex-1 mx-1 rounded-full ${
                  index <= currentStep ? 'bg-blue-500' : 'bg-gray-200'
                }`}
              />
            ))}
          </div>

          <h2 className="text-3xl font-semibold mb-8 text-center">
            {questions[currentStep].title}
          </h2>

          <div className="space-y-4">
            {questions[currentStep].options.map((option) => (
              <button
                key={option}
                className="w-full p-6 text-left text-lg border-2 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all duration-200 ease-in-out"
                onClick={() => handleQuizAnswer(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </main>
  );
} 