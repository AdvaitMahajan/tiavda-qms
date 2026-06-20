import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/apiClient";
import type { User, Session } from "@supabase/supabase-js";
import type { Tables } from "@/integrations/supabase/types";

type Profile = Tables<"profiles"> & { org_id?: string | null; is_platform_admin?: boolean };

export interface Organization {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  plan: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  profile: Profile | null;
  organization: Organization | null;
  isPlatformAdmin: boolean;
  profileLoading: boolean;
  refetchProfile: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  profile: null,
  organization: null,
  isPlatformAdmin: false,
  profileLoading: true,
  refetchProfile: () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);

  const fetchProfile = useCallback(async (_uid: string) => {
    setProfileLoading(true);
    try {
      const me = await apiClient.get<{
        profile: Profile | null;
        organization: Organization | null;
        is_platform_admin: boolean;
      }>("/profiles/me");
      setProfile(me.profile);
      setOrganization(me.organization);
      setIsPlatformAdmin(me.is_platform_admin);
    } catch {
      setProfile(null);
      setOrganization(null);
      setIsPlatformAdmin(false);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const refetchProfile = useCallback(() => {
    if (user?.id) fetchProfile(user.id);
  }, [user?.id, fetchProfile]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        if (session?.user) {
          fetchProfile(session.user.id);
        } else {
          setProfile(null);
          setProfileLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfileLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setOrganization(null);
    setIsPlatformAdmin(false);
  };

  return (
    <AuthContext.Provider
      value={{ user, session, loading, profile, organization, isPlatformAdmin, profileLoading, refetchProfile, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
