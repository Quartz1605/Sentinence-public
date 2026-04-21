import { Card, CardContent } from "@/components/ui/Card";
import { Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { Question } from "@/store/useInterviewStore";

interface QuestionCardProps {
  question: Question;
  currentNumber: number;
  totalNumber: number;
  onTimeUp?: () => void;
}

export function QuestionCard({ question, currentNumber, totalNumber, onTimeUp }: QuestionCardProps) {
  const [timeLeft, setTimeLeft] = useState(question.durationSeconds);

  useEffect(() => {
    setTimeLeft(question.durationSeconds);
  }, [question]);

  useEffect(() => {
    if (timeLeft <= 0) {
      onTimeUp?.();
      return;
    }
    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft, onTimeUp]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Card className="w-full">
      <CardContent className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div className="flex gap-2 items-center">
            <span className="text-sm font-semibold px-2 py-1 bg-indigo-500/10 text-indigo-400 rounded-md">
              Question {currentNumber} of {totalNumber}
            </span>
            <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium">
              {question.type}
            </span>
          </div>
          <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-full ${timeLeft < 30 ? 'bg-red-500/10 text-red-400' : 'bg-zinc-800 text-zinc-300'}`}>
            <Clock className="w-4 h-4" />
            <span className="font-mono text-sm font-medium">{formatTime(timeLeft)}</span>
          </div>
        </div>
        <h2 className="text-xl sm:text-2xl font-medium text-white leading-relaxed">
          {question.text}
        </h2>
      </CardContent>
    </Card>
  );
}
