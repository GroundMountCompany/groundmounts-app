'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Button from "@/components/common/Button";
import { motion } from 'framer-motion';
import { v4 as uuidv4 } from 'uuid';
import { TAB_NAME } from '@/constants/quote';

interface QuizData {
  userId: string;
  state: string;
  solarMotivation: string;
  successCriteria: string;
  decisionMaker: string;
}

export default function QuizPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const state = searchParams.get('state') || '';

  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  // Ensure userId is set even after page refresh
  useEffect(() => {
    if (!quizData.userId) {
      const userId = uuidv4();
      localStorage.setItem('solar_quiz_user_id', userId);
      setQuizData(prev => ({ ...prev, userId }));
    }
  }, []);

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

  const handleOptionSelect = async (field: string, value: string) => {
    const updatedQuizData = {
      ...quizData,
      [field]: value
    };
    setQuizData(updatedQuizData);

    if (currentStep < questions.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      // This is the last question, submit data
      setIsSubmitting(true);
      const timestamp = new Date().toISOString();
    const sessionId = `SESSION_${timestamp.replace(/[^0-9]/g, '')}`;
      const rowsData = [
        // Row for Question 1
        [
          updatedQuizData.userId, // Unique user ID
          sessionId,   // Unique session ID
          timestamp,
          updatedQuizData.state,
          "What matters most to you about going solar?",
          updatedQuizData.solarMotivation
        ],
        // Row for Question 2
        [
          updatedQuizData.userId,
          sessionId,
          timestamp,
          updatedQuizData.state,
          "What would make this solar project a success for you?",
          updatedQuizData.successCriteria
        ],
        // Row for Question 3
        [
          updatedQuizData.userId,
          sessionId,
          timestamp,
          updatedQuizData.state,
          "Whose decision is this?",
          updatedQuizData.decisionMaker
        ]
      ];
      try {
        const response = await fetch('/api/submit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({tabName: TAB_NAME.QUIZ, data: rowsData}),
        });

        if (!response.ok) {
          throw new Error('Failed to submit data');
        }

        // Clear userId from localStorage after successful submission
        
        // Redirect to the next step or thank you page
        router.push('/quote');
      } catch (error) {
        console.error('Error:', error);
        alert('There was an error submitting your information. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
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
                onClick={() => handleOptionSelect(questions[currentStep].field, option)}
                disabled={isSubmitting}
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