import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, onAuthStateChanged } from "firebase/auth";
import { auth, db, isDevelopmentLike } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { toast } from "sonner";
import { UserData, UserRole, UserPreferences, AuthContextType } from "@/types/AuthTypes";
import { useAuthMethods } from "@/hooks/AuthHooks";
import { MOCK_USERS } from "@/types/AuthTypes";
import { getMockUserData } from "@/utils/AuthUtils";

// Create the auth context with undefined as initial value
const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const authMethods = useAuthMethods();

  // Log mock users to console for development and preview
  useEffect(() => {
    if (isDevelopmentLike) {
      console.log("AuthContext - isDevelopmentLike:", isDevelopmentLike);
      console.log("Mock users available for development: ", MOCK_USERS.map(u => `${u.email} (${u.role})`).join(", "));
    }
  }, []);

  useEffect(() => {
    console.log("AuthProvider initialized, isDevelopmentLike:", isDevelopmentLike);
    let unsubscribe: () => void = () => {};
    
    // For preview environments, auto-set a demo user
    if (window.location.hostname.includes('lovable')) {
      console.log("Preview environment detected - auto-setting retailer demo user");
      const demoUser = auth.currentUser;
      setUser(demoUser);
      
      // Use the retailer demo user data instead of consumer
      const mockUserData = getMockUserData('retailer@example.com');
      if (mockUserData) {
        console.log("Setting mock retailer user data for preview:", mockUserData);
        setUserData(mockUserData);
      } else {
        console.warn("Failed to get mock user data for preview");
      }
      
      setIsLoading(false);
      return;
    } else if (isDevelopmentLike) {
      console.log("Using development mock auth in AuthContext");
      unsubscribe = auth.onAuthStateChanged((currentUser) => {
        console.log("Mock auth state changed:", currentUser ? `Logged in as ${currentUser.email}` : "Not logged in");
        setUser(currentUser);
        
        if (currentUser) {
          const userData = getMockUserData(currentUser.email || 'user@example.com');
          setUserData(userData);
        } else {
          setUserData(null);
        }
        
        setIsLoading(false);
      });
    } else {
      // In production, use real Firebase Auth
      unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        console.log("Auth state changed:", currentUser ? `Logged in as ${currentUser.email}` : "Not logged in");
        setUser(currentUser);
        
        if (currentUser) {
          try {
            const userDocRef = doc(db, "users", currentUser.uid);
            const userDoc = await getDoc(userDocRef);
            
            if (userDoc.exists()) {
              setUserData(userDoc.data() as UserData);
            } else {
              // If user document doesn't exist yet (first login)
              const newUserData: UserData = {
                uid: currentUser.uid,
                email: currentUser.email,
                displayName: currentUser.displayName,
                photoURL: currentUser.photoURL,
                role: "user", // Default role is now "user" instead of "consumer"
                createdAt: Date.now(),
                sustainabilityScore: 0,
                rewardsPoints: 0,
                consentSettings: {
                  marketing: false,
                  cookies: true,
                  dataSharing: false,
                  lastUpdated: Date.now()
                },
                preferences: {
                  language: 'en',
                  highContrast: false,
                  largeText: false,
                  reducedMotion: false,
                  screenReader: false
                }
              };
              // Will be created in the firestore by the signUp method
              setUserData(newUserData);
            }
          } catch (error) {
            console.error("Error fetching user data:", error);
            toast.error("Failed to load user data. Please refresh the page.");
          }
        } else {
          setUserData(null);
        }
        
        setIsLoading(false);
      });
    }
    
    // Clean up the listener
    return () => unsubscribe();
  }, []);

  // Let's add a helper function to get role permissions
  const hasRole = (requiredRoles: UserRole[] = []): boolean => {
    if (!userData || !userData.role) return false;
    return requiredRoles.includes(userData.role);
  };

  const signUp = async (
    email: string, 
    password: string, 
    name: string, 
    role: UserRole = "consumer",
    additionalData?: Partial<UserData>
  ) => {
    console.log(`Attempting signup for ${email} with role ${role}`);
    const result = await authMethods.signUp(email, password, name, role, additionalData);
    setUser(result.user);
    setUserData(result.userData);
  };

  const signIn = async (email: string, password: string) => {
    console.log(`Attempting signin for ${email}`);
    const result = await authMethods.signIn(email, password);
    setUser(result.user);
    if (result.userData) {
      setUserData(result.userData);
    }
  };

  const signInWithGoogle = async (role: UserRole = "consumer") => {
    console.log(`Attempting Google signin with role ${role}`);
    const result = await authMethods.signInWithGoogle(role);
    setUser(result.user);
    setUserData(result.userData);
  };

  const logout = async () => {
    console.log("Attempting logout");
    try {
      // First clear the local state
      setUser(null);
      setUserData(null);
      
      // Then call the logout method from authMethods
      await authMethods.logout();
      
      // Show a success message
      toast.success("Logged out successfully");
    } catch (error: any) {
      console.error("Logout error:", error);
      toast.error(error.message || "Failed to log out");
      throw error;
    }
  };

  const resetPassword = async (email: string): Promise<void> => {
    await authMethods.resetPassword(email);
  };

  const updateUserPreferences = async (preferences: Partial<UserPreferences>) => {
    const updatedPreferences = await authMethods.updateUserPreferences(user, userData, preferences);
    if (userData) {
      setUserData({
        ...userData,
        preferences: updatedPreferences
      });
    }
  };

  const updateConsentSettings = async (settings: Partial<UserData['consentSettings']>) => {
    const updatedSettings = await authMethods.updateConsentSettings(user, userData, settings);
    if (userData) {
      setUserData({
        ...userData,
        consentSettings: updatedSettings
      });
    }
  };

  const value = {
    user,
    userData,
    isLoading,
    signUp,
    signIn,
    signInWithGoogle,
    logout,
    resetPassword,
    updateUserPreferences,
    updateConsentSettings,
    hasRole
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export type { UserRole, UserPreferences };
