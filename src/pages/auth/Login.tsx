import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, Info, AlertCircle, Cookie } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MOCK_USERS } from "@/types/AuthTypes";
import { isDevelopmentLike } from "@/lib/firebase";

const loginSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address" }),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const getLoginAttempts = (): number => {
  const attempts = localStorage.getItem('loginAttempts');
  return attempts ? parseInt(attempts, 10) : 0;
};

const incrementLoginAttempts = (): number => {
  if (isDevelopmentLike) {
    return 0;
  }
  
  const attempts = getLoginAttempts() + 1;
  localStorage.setItem('loginAttempts', attempts.toString());
  return attempts;
};

const resetLoginAttempts = (): void => {
  localStorage.removeItem('loginAttempts');
};

const Login = () => {
  const { signIn, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showCookieBanner, setShowCookieBanner] = useState(false);
  const [lockoutTime, setLockoutTime] = useState<number | null>(null);
  
  const [showDemoAccounts, setShowDemoAccounts] = useState(true);
  const isPreviewEnvironment = window.location.hostname.includes('lovable');

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  useEffect(() => {
    if (isPreviewEnvironment) {
      console.log("Preview environment detected - auto-redirecting to dashboard");
      navigate("/");
    }
  }, [navigate, isPreviewEnvironment]);

  useEffect(() => {
    console.log(`Login component - isDevelopmentLike: ${isDevelopmentLike}`);
    console.log(`Login component - hostname: ${window.location.hostname}`);
    console.log(`Login component - isPreviewEnvironment: ${isPreviewEnvironment}`);
    
    const hasAcceptedCookies = localStorage.getItem('cookieConsent');
    if (!hasAcceptedCookies) {
      setShowCookieBanner(true);
    }

    if (isDevelopmentLike) {
      localStorage.removeItem('lockoutUntil');
      localStorage.removeItem('loginAttempts');
      return;
    }

    const lockoutUntil = localStorage.getItem('lockoutUntil');
    if (lockoutUntil) {
      const lockoutTime = parseInt(lockoutUntil, 10);
      if (lockoutTime > Date.now()) {
        setLockoutTime(lockoutTime);
      } else {
        localStorage.removeItem('lockoutUntil');
      }
    }
  }, [isPreviewEnvironment]);

  useEffect(() => {
    if (!lockoutTime) return;

    const interval = setInterval(() => {
      if (lockoutTime <= Date.now()) {
        setLockoutTime(null);
        localStorage.removeItem('lockoutUntil');
        clearInterval(interval);
      } else {
        setLockoutTime(lockoutTime);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [lockoutTime]);

  const acceptCookies = () => {
    localStorage.setItem('cookieConsent', 'true');
    setShowCookieBanner(false);
    toast.success("Cookie preferences saved");
  };

  const declineCookies = () => {
    localStorage.setItem('cookieConsent', 'false');
    setShowCookieBanner(false);
    toast.success("Cookie preferences saved (minimal cookies)");
  };

  const onSubmit = async (data: LoginFormValues) => {
    if (!isDevelopmentLike) {
      if (lockoutTime && lockoutTime > Date.now()) {
        const minutes = Math.ceil((lockoutTime - Date.now()) / 60000);
        toast.error(`Account temporarily locked. Try again in ${minutes} minutes.`);
        return;
      }
    }

    setIsLoading(true);
    try {
      await signIn(data.email, data.password);
      resetLoginAttempts();
      navigate("/");
    } catch (error) {
      console.error(error);
      
      if (!isDevelopmentLike) {
        const attempts = incrementLoginAttempts();
        
        if (attempts >= 5) {
          const lockoutUntil = Date.now() + 15 * 60 * 1000;
          localStorage.setItem('lockoutUntil', lockoutUntil.toString());
          setLockoutTime(lockoutUntil);
          toast.error("Too many failed login attempts. Account locked for 15 minutes.");
        } else if (attempts >= 3) {
          toast.error(`Login failed. ${5 - attempts} attempts remaining before lockout.`);
        }
      } else {
        const isMockUser = MOCK_USERS.some(u => u.email === data.email && u.password === data.password);
        if (isMockUser) {
          toast.error("Firebase API key is invalid. In development mode, click the 'Use' button for mock accounts.");
        } else {
          toast.error("Invalid email or password");
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      resetLoginAttempts();
      navigate("/");
    } catch (error) {
      console.error(error);
      if (isDevelopmentLike) {
        toast.error("Firebase API key is invalid. In development mode, use the mock accounts instead.");
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const fillMockUser = (type: string) => {
    const user = MOCK_USERS.find(u => u.role === type);
    if (user) {
      form.setValue('email', user.email);
      form.setValue('password', user.password);
      toast.info(`Demo ${type} account selected`, {
        description: `Email: ${user.email}, Password: ${user.password}`
      });
      
      if (isDevelopmentLike) {
        setIsLoading(true);
        setTimeout(() => {
          signIn(user.email, user.password)
            .then(() => {
              navigate("/");
            })
            .finally(() => {
              setIsLoading(false);
            });
        }, 500);
      }
    }
  };

  useEffect(() => {
    if (isDevelopmentLike) {
      console.log("Mock users available:", MOCK_USERS);
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-light-bg p-4">
      {isPreviewEnvironment ? (
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-soft-pink mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Preview Mode Active</h2>
          <p className="mb-4">Auto-redirecting to dashboard...</p>
        </div>
      ) : (
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-12 h-12 rounded-xl bg-soft-pink flex items-center justify-center mx-auto mb-4">
              <span className="font-bold text-white text-xl">CH</span>
            </div>
            <h1 className="text-2xl font-bold">Chiqui</h1>
            <p className="text-muted-foreground">Transforming Sustainable Retail</p>
          </div>
          
          {!isDevelopmentLike && lockoutTime && (
            <Alert className="mb-4 bg-red-50 border-red-200 text-red-800">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription>
                Account temporarily locked due to multiple failed login attempts. 
                Try again in {Math.ceil((lockoutTime - Date.now()) / 60000)} minutes.
              </AlertDescription>
            </Alert>
          )}
          
          {isDevelopmentLike && (
            <Alert className="mb-4 bg-blue-50 border-blue-200 text-blue-800">
              <Info className="h-4 w-4 text-blue-600" />
              <AlertDescription>
                Development mode active. Use the demo accounts below to sign in.
              </AlertDescription>
            </Alert>
          )}
          
          <Card className="w-full backdrop-blur-sm bg-white/80 border-none shadow-lg animate-fade-up">
            <CardHeader>
              <CardTitle>Sign In</CardTitle>
              <CardDescription>
                Enter your credentials to access your account
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="your@email.com" 
                            {...field} 
                            aria-label="Email address"
                            autoComplete="email"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input 
                            type="password" 
                            placeholder="********" 
                            {...field} 
                            aria-label="Password"
                            autoComplete="current-password"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={isLoading || (!isDevelopmentLike && lockoutTime !== null && lockoutTime > Date.now())}
                  >
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Sign In
                  </Button>
                </form>
              </Form>
              
              <div className="mt-4">
                <Accordion 
                  type="single" 
                  collapsible 
                  className="w-full" 
                  defaultValue="demo-accounts"
                >
                  <AccordionItem value="demo-accounts">
                    <AccordionTrigger className="text-sm text-muted-foreground py-2">
                      <span className="flex items-center">
                        <Info className="h-4 w-4 mr-2" />
                        Demo Accounts
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-2 p-2 bg-muted/50 rounded-md text-sm">
                        <div className="flex justify-between">
                          <span>Consumer:</span>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 text-xs" 
                            onClick={() => fillMockUser('consumer')}
                          >
                            Use
                          </Button>
                        </div>
                        <div className="flex justify-between">
                          <span>Retailer:</span>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 text-xs" 
                            onClick={() => fillMockUser('retailer')}
                          >
                            Use
                          </Button>
                        </div>
                        <div className="flex justify-between">
                          <span>Logistics:</span>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 text-xs" 
                            onClick={() => fillMockUser('logistics')}
                          >
                            Use
                          </Button>
                        </div>
                        <div className="flex justify-between">
                          <span>Admin:</span>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 text-xs" 
                            onClick={() => fillMockUser('admin')}
                          >
                            Use
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          All mock accounts use password: password123
                        </p>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
              
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-muted-foreground">Or continue with</span>
                </div>
              </div>
              
              <Button
                variant="outline"
                onClick={handleGoogleSignIn}
                disabled={googleLoading || isDevelopmentLike}
                className="w-full"
                aria-label="Sign in with Google"
                title={isDevelopmentLike ? "Google sign-in is disabled in development mode" : ""}
              >
                {googleLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                )}
                Google
              </Button>
            </CardContent>
            <CardFooter className="flex flex-col space-y-4">
              <div className="text-center text-sm text-muted-foreground">
                <Link to="/auth/forgot-password" className="underline underline-offset-4 hover:text-primary">
                  Forgot password?
                </Link>
              </div>
              <div className="text-center text-sm">
                Don't have an account?{" "}
                <Link to="/auth/signup" className="text-soft-pink hover:underline">
                  Sign up
                </Link>
              </div>
            </CardFooter>
          </Card>
        </div>
      )}
      
      {showCookieBanner && !isPreviewEnvironment && (
        <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-sm p-4 shadow-lg border-t border-gray-200 animate-slide-up z-50">
          <div className="container mx-auto max-w-6xl flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Cookie className="h-5 w-5 text-soft-pink flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-medium mb-1">This website uses cookies</h3>
                <p className="text-sm text-muted-foreground">
                  We use cookies to ensure you get the best experience on our website. 
                  By using our site, you acknowledge that you have read and understand our 
                  <a href="/legal/privacy-policy" className="text-soft-pink ml-1 hover:underline">Privacy Policy</a>.
                </p>
              </div>
            </div>
            <div className="flex gap-2 w-full md:w-auto">
              <Button 
                variant="outline" 
                className="w-1/2 md:w-auto" 
                onClick={declineCookies}
              >
                Decline
              </Button>
              <Button 
                className="w-1/2 md:w-auto"
                onClick={acceptCookies}
              >
                Accept All
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;
