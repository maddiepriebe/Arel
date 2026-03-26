import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="space-y-4 text-center">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">MoCo</p>
          <h1 className="text-2xl font-bold text-gray-900">Rent Optimizer</h1>
          <p className="text-sm text-gray-500 mt-1">Montgomery County Rent Stabilization</p>
        </div>
        <SignIn afterSignInUrl="/" />
      </div>
    </div>
  );
}
