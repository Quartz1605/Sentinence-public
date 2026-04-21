import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { BadgeCheck, Clock } from "lucide-react";

interface Interview {
  id: string;
  role: string;
  date: string;
  score: number;
  status: string;
}

interface RecentInterviewsProps {
  interviews: Interview[];
}

export function RecentInterviews({ interviews }: RecentInterviewsProps) {
  return (
    <Card className="col-span-full xl:col-span-2">
      <CardHeader>
        <CardTitle>Recent Interviews</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {interviews.map((interview) => (
            <div key={interview.id} className="flex items-center justify-between p-4 rounded-xl border border-zinc-800/50 bg-zinc-900/20 hover:bg-zinc-900/50 transition-colors">
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center">
                  <BadgeCheck className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{interview.role}</p>
                  <p className="text-xs text-zinc-400 flex items-center mt-1">
                    <Clock className="w-3 h-3 mr-1" />
                    {new Date(interview.date).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-sm font-semibold text-white">{interview.score}%</p>
                  <p className="text-xs text-zinc-500">Score</p>
                </div>
                <div className={`px-2 py-1 rounded-full text-xs font-medium ${interview.status === 'completed' ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                  {interview.status}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
