"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useInterviewStore } from "@/store/useInterviewStore";
import { VideoFeed } from "@/components/interview/VideoFeed";
import { QuestionCard } from "@/components/interview/QuestionCard";
import { RecordingControls } from "@/components/interview/RecordingControls";
import { Loader } from "@/components/ui/Loader";
import { useVoiceWebSocket } from "@/hooks/useVoiceWebSocket";
import { LiveMetrics } from "@/components/interview/LiveMetrics";

export default function InterviewPage() {
  const router = useRouter();
  const { 
    questions, setQuestions, currentQuestionIndex, nextQuestion, 
    isRecording, setRecording, addResponse, status, setStatus 
  } = useInterviewStore();
  
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  const { metrics } = useVoiceWebSocket(isRecording);

  useEffect(() => {
    async function initInterview() {
      // 1. Start session
      await api.startInterview();
      // 2. Fetch questions
      const fetchedQuestions = await api.getQuestions();
      setQuestions(fetchedQuestions);
      setLoadingInitial(false);
      setStatus('in-progress');
    }
    initInterview();
  }, [setQuestions, setStatus]);

  const handleToggleRecord = () => {
    if (isRecording) {
      setRecording(false);
      // Simulate saving blob
      addResponse(questions[currentQuestionIndex].id, null, "Text response simulated");
    } else {
      setRecording(true);
    }
  };

  const handleNext = async () => {
    if (isRecording) {
      handleToggleRecord();
    }
    
    setSubmitting(true);
    // Send response to backend
    await api.sendResponse({ 
      questionId: questions[currentQuestionIndex].id 
    });
    setSubmitting(false);

    if (currentQuestionIndex < questions.length - 1) {
      nextQuestion();
    } else {
      // Finished
      setStatus('analyzing');
      router.push("/results");
    }
  };

  const handleTimeUp = () => {
    if (isRecording) handleToggleRecord();
  };

  if (loadingInitial) {
    return <div className="min-h-screen bg-black flex items-center justify-center"><Loader text="Preparing your interview environment..." /></div>;
  }

  if (status === 'analyzing') {
    return <div className="min-h-screen bg-black flex items-center justify-center"><Loader text="Analyzing your final responses..." /></div>;
  }

  const currentQuestion = questions[currentQuestionIndex];

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8 flex flex-col font-sans">
      <div className="max-w-5xl mx-auto w-full flex-1 flex flex-col space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="font-bold text-lg">A</span>
            </div>
            <span className="text-xl font-semibold tracking-tight hidden sm:inline-block">Alyna Interview</span>
          </div>
          <div className="text-sm text-zinc-500">Session ID: MOCK-1234</div>
        </div>

        {/* Main Content Area */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
          
          {/* Left Column: Webcam (takes more space) */}
          <div className="lg:col-span-8 flex flex-col bg-zinc-900/30 rounded-2xl border border-zinc-800 p-2">
             <VideoFeed />
          </div>

          {/* Right Column: Question & Controls */}
          <div className="lg:col-span-4 flex flex-col space-y-4">
            <QuestionCard 
              question={currentQuestion}
              currentNumber={currentQuestionIndex + 1}
              totalNumber={questions.length}
              onTimeUp={handleTimeUp}
            />
            
            <div className="flex-1 bg-zinc-900/20 rounded-2xl border border-zinc-800 p-6 flex flex-col justify-end">
              <div className="text-sm text-zinc-400 mb-4">
                Tips: Keep your eyes on the camera, speak clearly, and structure your answer using the STAR method if applicable.
              </div>
              <RecordingControls 
                isRecording={isRecording}
                onToggleRecord={handleToggleRecord}
                onNext={handleNext}
                isLastQuestion={currentQuestionIndex === questions.length - 1}
                isLoading={submitting}
              />
              <LiveMetrics metrics={metrics} isRecording={isRecording} />
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
