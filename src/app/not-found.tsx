"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

function NotFound() {
  const router = useRouter();
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    // 3秒倒计时跳转
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          router.push("/"); // 跳转到根路径，basePath 会自动处理为 /dp2api
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [router]);

  return (
    <div style={{ textAlign: 'center', padding: '50px' }}>
      <h2>404 Not Found</h2>
      <p>There is nothing here...</p>
      <p>将在 {countdown} 秒后自动跳转到首页...</p>
      <Link href="/">立即跳转首页</Link>
    </div>
  );
}

export default NotFound;
