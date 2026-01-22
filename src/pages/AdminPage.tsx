import { useState, useEffect } from 'react';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  Loader2,
  Shield,
  UserPlus,
  UserMinus,
  Search,
  ExternalLink,
  FileText,
  BarChart3,
  Settings2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { AdminAnalyticsDashboard } from '@/components/admin/AdminAnalyticsDashboard';
import { AdminContentManagement } from '@/components/admin/AdminContentManagement';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface VerificationRequest {
  id: string;
  user_id: string;
  full_name: string;
  known_as: string | null;
  category: string;
  bio_link: string | null;
  id_document_url: string | null;
  additional_info: string | null;
  status: string;
  created_at: string;
  profile?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    is_verified: boolean | null;
  };
}

interface AdminUser {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  profile?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
}

export default function AdminPage() {
  const { user } = useAuth();
  const { isAdmin, isLoading: adminLoading, grantAdminRole, revokeAdminRole } = useAdminAccess();
  
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<VerificationRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [addAdminDialogOpen, setAddAdminDialogOpen] = useState(false);
  const [newAdminUsername, setNewAdminUsername] = useState('');

  useEffect(() => {
    if (isAdmin) {
      fetchData();
    }
  }, [isAdmin]);

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchRequests(), fetchAdmins()]);
    setLoading(false);
  };

  const fetchRequests = async () => {
    const { data, error } = await supabase
      .from('verification_requests')
      .select(`
        *,
        profile:profiles!verification_requests_user_id_fkey(
          username, display_name, avatar_url, is_verified
        )
      `)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setRequests(data as unknown as VerificationRequest[]);
    }
  };

  const fetchAdmins = async () => {
    const { data, error } = await supabase
      .from('user_roles')
      .select(`
        *,
        profile:profiles!user_roles_user_id_fkey(
          username, display_name, avatar_url
        )
      `)
      .eq('role', 'admin');

    if (!error && data) {
      setAdmins(data as unknown as AdminUser[]);
    }
  };

  const handleApprove = async (request: VerificationRequest) => {
    setProcessing(true);
    try {
      // Update verification request status
      await supabase
        .from('verification_requests')
        .update({ 
          status: 'approved',
          reviewed_at: new Date().toISOString(),
          reviewed_by: user?.id
        })
        .eq('id', request.id);

      // Set user as verified
      await supabase
        .from('profiles')
        .update({ is_verified: true })
        .eq('id', request.user_id);

      // Create notification
      await supabase.from('notifications').insert({
        user_id: request.user_id,
        type: 'verification',
        title: 'Verification Approved',
        body: 'Congratulations! Your account has been verified.',
        data: { request_id: request.id }
      });

      toast.success('Verification approved');
      fetchRequests();
    } catch (error) {
      toast.error('Failed to approve verification');
    } finally {
      setProcessing(false);
      setSelectedRequest(null);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest) return;
    setProcessing(true);
    try {
      await supabase
        .from('verification_requests')
        .update({ 
          status: 'rejected',
          rejection_reason: rejectionReason,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user?.id
        })
        .eq('id', selectedRequest.id);

      // Create notification
      await supabase.from('notifications').insert({
        user_id: selectedRequest.user_id,
        type: 'verification',
        title: 'Verification Rejected',
        body: rejectionReason || 'Your verification request was not approved.',
        data: { request_id: selectedRequest.id }
      });

      toast.success('Verification rejected');
      fetchRequests();
    } catch (error) {
      toast.error('Failed to reject verification');
    } finally {
      setProcessing(false);
      setSelectedRequest(null);
      setRejectionReason('');
    }
  };

  const handleAddAdmin = async () => {
    if (!newAdminUsername.trim()) return;
    setProcessing(true);

    try {
      // Find user by username
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', newAdminUsername.replace('@', ''))
        .single();

      if (!profile) {
        toast.error('User not found');
        return;
      }

      const { error } = await grantAdminRole(profile.id);
      if (error) {
        toast.error(error);
        return;
      }

      toast.success(`Admin role granted to @${newAdminUsername}`);
      setNewAdminUsername('');
      setAddAdminDialogOpen(false);
      fetchAdmins();
    } catch (error) {
      toast.error('Failed to add admin');
    } finally {
      setProcessing(false);
    }
  };

  const handleRemoveAdmin = async (adminUserId: string) => {
    if (adminUserId === user?.id) {
      toast.error('You cannot remove yourself');
      return;
    }

    const { error } = await revokeAdminRole(adminUserId);
    if (error) {
      toast.error(error);
      return;
    }

    toast.success('Admin role revoked');
    fetchAdmins();
  };

  if (adminLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/home" replace />;
  }

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const processedRequests = requests.filter(r => r.status !== 'pending');
  const filteredRequests = pendingRequests.filter(r => 
    r.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.profile?.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="flex items-center gap-3 mb-8">
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
          <Shield className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Admin Panel</h1>
          <p className="text-muted-foreground text-sm">Manage verifications and admin roles</p>
        </div>
      </div>

      <Tabs defaultValue="analytics" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="analytics" className="flex items-center gap-1">
            <BarChart3 className="h-4 w-4" />
            Analitika
          </TabsTrigger>
          <TabsTrigger value="content" className="flex items-center gap-1">
            <Settings2 className="h-4 w-4" />
            Kontent
          </TabsTrigger>
          <TabsTrigger value="pending" className="relative">
            Pending
            {pendingRequests.length > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 w-5 p-0 text-xs">
                {pendingRequests.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="admins">Admins</TabsTrigger>
        </TabsList>

        {/* Analytics Dashboard */}
        <TabsContent value="analytics" className="space-y-4">
          <AdminAnalyticsDashboard />
        </TabsContent>

        {/* Content Management */}
        <TabsContent value="content" className="space-y-4">
          <AdminContentManagement />
        </TabsContent>

        {/* Pending Requests */}
        <TabsContent value="pending" className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search requests..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <ScrollArea className="h-[calc(100vh-320px)]">
            <div className="space-y-3">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : filteredRequests.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No pending requests</p>
                </div>
              ) : (
                filteredRequests.map((request) => (
                  <div
                    key={request.id}
                    className="bg-card rounded-xl border border-border p-4"
                  >
                    <div className="flex items-start gap-4">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={request.profile?.avatar_url || ''} />
                        <AvatarFallback>
                          {request.full_name[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{request.full_name}</h3>
                          {request.known_as && (
                            <span className="text-sm text-muted-foreground">
                              "{request.known_as}"
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          @{request.profile?.username || 'unknown'}
                        </p>
                        <Badge variant="outline" className="mt-2">
                          {request.category}
                        </Badge>
                        
                        {request.bio_link && (
                          <a
                            href={request.bio_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-sm text-primary mt-2 hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Bio Link
                          </a>
                        )}
                        
                        {request.id_document_url && (
                          <a
                            href={request.id_document_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-sm text-muted-foreground mt-1 hover:underline"
                          >
                            <FileText className="h-3 w-3" />
                            ID Document
                          </a>
                        )}
                        
                        {request.additional_info && (
                          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                            {request.additional_info}
                          </p>
                        )}
                        
                        <p className="text-xs text-muted-foreground mt-2">
                          {format(new Date(request.created_at), 'MMM d, yyyy HH:mm')}
                        </p>
                      </div>

                      <div className="flex flex-col gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleApprove(request)}
                          disabled={processing}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedRequest(request)}
                          disabled={processing}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* History */}
        <TabsContent value="history" className="space-y-4">
          <ScrollArea className="h-[calc(100vh-280px)]">
            <div className="space-y-3">
              {processedRequests.map((request) => (
                <div
                  key={request.id}
                  className="bg-card rounded-xl border border-border p-4"
                >
                  <div className="flex items-center gap-4">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={request.profile?.avatar_url || ''} />
                      <AvatarFallback>{request.full_name[0]}</AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{request.full_name}</span>
                        <span className="text-sm text-muted-foreground">
                          @{request.profile?.username}
                        </span>
                        {request.status === 'approved' && (
                          <VerifiedBadge size="sm" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(request.created_at), 'MMM d, yyyy')}
                      </p>
                    </div>

                    <Badge
                      variant={request.status === 'approved' ? 'default' : 'destructive'}
                    >
                      {request.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Admins */}
        <TabsContent value="admins" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setAddAdminDialogOpen(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Add Admin
            </Button>
          </div>

          <ScrollArea className="h-[calc(100vh-320px)]">
            <div className="space-y-3">
              {admins.map((admin) => (
                <div
                  key={admin.id}
                  className="bg-card rounded-xl border border-border p-4"
                >
                  <div className="flex items-center gap-4">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={admin.profile?.avatar_url || ''} />
                      <AvatarFallback>
                        {admin.profile?.display_name?.[0] || 'A'}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1">
                      <p className="font-medium">
                        {admin.profile?.display_name || 'Unknown'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        @{admin.profile?.username || 'unknown'}
                      </p>
                    </div>

                    {admin.user_id !== user?.id && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleRemoveAdmin(admin.user_id)}
                      >
                        <UserMinus className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Rejection Dialog */}
      <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Verification</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejection. This will be sent to the user.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason for rejection..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedRequest(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={processing}>
              {processing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Admin Dialog */}
      <Dialog open={addAdminDialogOpen} onOpenChange={setAddAdminDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Admin</DialogTitle>
            <DialogDescription>
              Enter the username of the user you want to make an admin.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="@username"
            value={newAdminUsername}
            onChange={(e) => setNewAdminUsername(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddAdminDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddAdmin} disabled={processing || !newAdminUsername.trim()}>
              {processing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Admin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}