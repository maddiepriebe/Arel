import { redirect } from 'next/navigation';

// Root redirects to dashboard; auth guard is handled by middleware
export default function Home() {
  redirect('/dashboard');
}
