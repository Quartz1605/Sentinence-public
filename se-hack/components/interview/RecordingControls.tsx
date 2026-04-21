import { Button } from "@/components/ui/Button";
import { Play, Square, ArrowRight, Loader2 } from "lucide-react";

interface RecordingControlsProps {
  isRecording: boolean;
  onToggleRecord: () => void;
  onNext: () => void;
  isLastQuestion: boolean;
  isLoading?: boolean;
}

export function RecordingControls({ 
  isRecording, 
  onToggleRecord, 
  onNext, 
  isLastQuestion,
  isLoading
}: RecordingControlsProps) {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6">
      <div className="flex items-center gap-4">
        {isRecording && (
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm font-medium text-red-500">Recording</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 w-full sm:w-auto">
        <Button
          variant={isRecording ? "outline" : "default"}
          className={`flex-1 sm:flex-none ${isRecording ? 'border-red-500/50 text-red-500 hover:bg-red-500/10' : 'bg-red-600 text-white hover:bg-red-700'}`}
          onClick={onToggleRecord}
          disabled={isLoading}
        >
          {isRecording ? (
            <>
              <Square className="w-4 h-4 mr-2 fill-current" /> Stop Recording
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2 fill-current" /> Start Recording
            </>
          )}
        </Button>

        <Button
          variant="secondary"
          className="flex-1 sm:flex-none"
          onClick={onNext}
          disabled={isLoading || isRecording}
        >
          {isLoading ? (
             <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : isLastQuestion ? (
            "Finish Interview"
          ) : (
            <>
              Next Question <ArrowRight className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
