import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { adminService } from "@/services";
import { useUIStore } from "@/store";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Flag, MessageSquare, RotateCcw, Users, UsersRound } from "lucide-react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const {
    data: stats,
    isLoading,
    isError,

    refetch,
  } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: adminService.getDashboardStats,
  });

  const setGlobalLoading = useUIStore((state) => state.setGlobalLoading);

  useEffect(() => {
    if (!isLoading) {
      setGlobalLoading(false);
    }
  }, [isLoading, setGlobalLoading]);

  const cards = [
    {
      title: "Total Users",
      value: stats?.total_users || 0,
      description: "Registered users in the system",
      icon: Users,
      href: "/admin/users",
    },
    {
      title: "Total Messages",
      value: stats?.total_messages || 0,
      description: "Messages sent across all chats",
      icon: MessageSquare,
      href: "/admin/dashboard",
    },
    {
      title: "Active Groups",
      value: stats?.total_groups || 0,
      description: "Active group chats",
      icon: UsersRound,
      href: "/admin/groups",
    },
    {
      title: "Active Reports",
      value: stats?.active_reports || 0,
      description: "Reports waiting for review",
      icon: Flag,
      href: "/admin/reports",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">Overview of your platform activity.</p>
        </div>
        <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isLoading}>
          {isLoading ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <RotateCcw className="h-4 w-4" />
          )}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card
            key={card.title}
            className="cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5"
            onClick={() => !isError && navigate(card.href)}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
              {isLoading ? (
                <Skeleton className="h-4 w-4 rounded" />
              ) : (
                <card.icon className="h-4 w-4 text-muted-foreground" />
              )}
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <>
                  <Skeleton className="h-8 w-20 mb-1" />
                  <Skeleton className="h-3 w-32" />
                </>
              ) : isError ? (
                <div className="flex flex-col gap-2">
                  <div className="text-sm text-destructive font-medium flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Failed to load
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-8 text-xs border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      refetch();
                    }}
                  >
                    Try Again
                  </Button>
                </div>
              ) : (
                <>
                  <div className="text-2xl font-bold">{card.value.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground">{card.description}</p>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
