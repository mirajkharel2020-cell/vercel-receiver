import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    if (router.query.d) {
      // Send query to API route
      fetch(`/api/log?d=${encodeURIComponent(router.query.d)}`);
    }
  }, [router.query]);

  return <h1>Receiver Active</h1>;
}
