import { useState, useEffect } from 'react';
import { X, Shield, Eye, Trash2, UserPlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface UserWithRoles {
  id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  roles: Array<'admin' | 'viewer' | 'team_member'>;
}

interface RoleManagementModalProps {
  onClose: () => void;
}

export const RoleManagementModal = ({ onClose }: RoleManagementModalProps) => {
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ userId: string; role: 'admin' | 'viewer' | 'team_member' } | null>(null);
  const { toast } = useToast();

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      // Fetch all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, user_id, email, display_name')
        .order('email');

      if (profilesError) throw profilesError;

      // Fetch all roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // Merge profiles with roles
      const usersWithRoles: UserWithRoles[] = (profiles || []).map(profile => ({
        ...profile,
        roles: (roles || [])
          .filter(r => r.user_id === profile.user_id)
          .map(r => r.role as 'admin' | 'viewer' | 'team_member')
      }));

      setUsers(usersWithRoles);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: 'Error',
        description: 'Failed to load users',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const addRole = async (userId: string, role: 'admin' | 'viewer') => {
    setActionInProgress(`add-${userId}-${role}`);
    try {
      const { error } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role });

      if (error) {
        if (error.code === '23505') {
          toast({
            title: 'Role exists',
            description: 'User already has this role',
            variant: 'destructive',
          });
          return;
        }
        throw error;
      }

      toast({
        title: 'Role added',
        description: `Successfully added ${role} role`,
      });
      await fetchUsers();
    } catch (error) {
      console.error('Error adding role:', error);
      toast({
        title: 'Error',
        description: 'Failed to add role',
        variant: 'destructive',
      });
    } finally {
      setActionInProgress(null);
    }
  };

  const removeRole = async (userId: string, role: 'admin' | 'viewer' | 'team_member') => {
    setActionInProgress(`remove-${userId}-${role}`);
    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('role', role);

      if (error) throw error;

      toast({
        title: 'Role removed',
        description: `Successfully removed ${role} role`,
      });
      setDeleteConfirm(null);
      await fetchUsers();
    } catch (error) {
      console.error('Error removing role:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove role',
        variant: 'destructive',
      });
    } finally {
      setActionInProgress(null);
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin':
        return 'default';
      case 'viewer':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin':
        return <Shield className="w-3 h-3" />;
      case 'viewer':
        return <Eye className="w-3 h-3" />;
      default:
        return null;
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        <div className="relative z-50 w-[min(800px,calc(100vw-2rem))] max-h-[90vh] rounded-xl border border-border bg-card text-card-foreground shadow-2xl flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Role Management</h2>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Content */}
          <ScrollArea className="flex-1 max-h-[calc(90vh-120px)]">
            <div className="p-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : users.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <p>No users found.</p>
                  <p className="text-sm mt-1">Users will appear here after they sign up.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Current Roles</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map(user => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {user.display_name || user.email || 'Unknown'}
                            </span>
                            {user.display_name && user.email && (
                              <span className="text-xs text-muted-foreground">{user.email}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {user.roles.length === 0 ? (
                              <span className="text-sm text-muted-foreground">No roles</span>
                            ) : (
                              user.roles.map(role => (
                                <Badge
                                  key={role}
                                  variant={getRoleBadgeVariant(role)}
                                  className="gap-1 cursor-pointer hover:opacity-80"
                                  onClick={() => setDeleteConfirm({ userId: user.user_id, role })}
                                >
                                  {getRoleIcon(role)}
                                  {role}
                                  <X className="w-3 h-3 ml-0.5" />
                                </Badge>
                              ))
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                          <Select
                              onValueChange={(value: string) => {
                                if (value === 'admin' || value === 'viewer') {
                                  addRole(user.user_id, value);
                                }
                              }}
                              disabled={actionInProgress?.startsWith(`add-${user.user_id}`)}
                            >
                              <SelectTrigger className="w-[140px]">
                                <SelectValue placeholder="Add role..." />
                              </SelectTrigger>
                              <SelectContent>
                                {!user.roles.includes('admin') && (
                                  <SelectItem value="admin">
                                    <div className="flex items-center gap-2">
                                      <Shield className="w-3 h-3" />
                                      Admin
                                    </div>
                                  </SelectItem>
                                )}
                                {!user.roles.includes('viewer') && (
                                  <SelectItem value="viewer">
                                    <div className="flex items-center gap-2">
                                      <Eye className="w-3 h-3" />
                                      Viewer
                                    </div>
                                  </SelectItem>
                                )}
                                {user.roles.includes('admin') && user.roles.includes('viewer') && (
                                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                                    All roles assigned
                                  </div>
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="border-t border-border p-4">
            <p className="text-xs text-muted-foreground">
              <strong>Admin:</strong> Full access - can view and edit all data.{' '}
              <strong>Viewer:</strong> Read-only access - can view but not modify data.
            </p>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Role</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove the <strong>{deleteConfirm?.role}</strong> role from this user?
              They will lose access associated with this role.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!actionInProgress}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && removeRole(deleteConfirm.userId, deleteConfirm.role)}
              disabled={!!actionInProgress}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {actionInProgress ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
