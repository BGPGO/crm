import {
  Phone,
  Mail,
  CheckCircle,
  MessageSquare,
  MoveRight,
  UserPlus,
  Trophy,
} from "lucide-react";
import { formatRelativeTime } from "@/lib/formatters";

export interface Activity {
  id: string;
  type: "call" | "email" | "task" | "note" | "stage_change" | "new_lead" | "won";
  text: string;
  deal?: string;
  dealId?: string;
  time: string;
}

const typeConfig: Record<
  Activity["type"],
  { icon: typeof Phone; color: string; bg: string }
> = {
  call: { icon: Phone, color: "text-blue-600", bg: "bg-blue-100" },
  email: { icon: Mail, color: "text-green-600", bg: "bg-green-100" },
  task: { icon: CheckCircle, color: "text-purple-600", bg: "bg-purple-100" },
  note: { icon: MessageSquare, color: "text-orange-600", bg: "bg-orange-100" },
  stage_change: { icon: MoveRight, color: "text-cyan-600", bg: "bg-cyan-100" },
  new_lead: { icon: UserPlus, color: "text-indigo-600", bg: "bg-indigo-100" },
  won: { icon: Trophy, color: "text-yellow-600", bg: "bg-yellow-100" },
};

interface RecentActivitiesProps {
  activities: Activity[];
  onViewAll?: () => void;
}

export default function RecentActivities({
  activities,
  onViewAll,
}: RecentActivitiesProps) {
  return (
    <div className="space-y-4">
      {activities.map((activity) => {
        const config = typeConfig[activity.type];
        const Icon = config.icon;

        return (
          <div key={activity.id} className="flex items-start gap-3">
            <div
              className={`${config.bg} ${config.color} p-2 rounded-full flex-shrink-0 mt-0.5`}
            >
              <Icon size={14} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-800">{activity.text}</p>
              {activity.deal && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {activity.dealId ? (
                    <a
                      href={`/deals/${activity.dealId}`}
                      className="hover:text-blue-600 hover:underline transition-colors"
                    >
                      {activity.deal}
                    </a>
                  ) : (
                    activity.deal
                  )}
                </p>
              )}
            </div>
            <span className="text-xs text-gray-400 flex-shrink-0">
              {formatRelativeTime(activity.time)}
            </span>
          </div>
        );
      })}

      {activities.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-6">
          Nenhuma atividade recente
        </p>
      )}
    </div>
  );
}
