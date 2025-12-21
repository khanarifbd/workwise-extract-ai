import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Check, Copy, Download, ExternalLink, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const isValidHttpUrl = (value: string) => {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

const TeamQRCode = () => {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  const portalUrl = useMemo(() => {
    // Allow generating a QR for a deployed/custom domain from preview:
    // /team-qr?baseUrl=https://yourdomain.com
    const baseFromQuery = searchParams.get("baseUrl") || searchParams.get("base") || "";
    const base = isValidHttpUrl(baseFromQuery) ? baseFromQuery : window.location.origin;
    return new URL("/team", base).toString();
  }, [searchParams]);

  const canShare =
    typeof navigator !== "undefined" &&
    typeof window !== "undefined" &&
    !!navigator.share &&
    window.isSecureContext;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(portalUrl);
      setCopied(true);
      toast({ title: "Copied!", description: "Team portal URL copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Error", description: "Failed to copy URL", variant: "destructive" });
    }
  };

  const handleShare = async () => {
    try {
      await navigator.share({
        title: "AllSaints Team Portal",
        text: "Access the team portal to view and manage your assigned jobs.",
        url: portalUrl,
      });
    } catch (error) {
      if ((error as Error)?.name !== "AbortError") {
        toast({
          title: "Share failed",
          description: "Your device/browser blocked sharing. Use Copy instead.",
          variant: "destructive",
        });
      }
    }
  };

  const handleDownload = () => {
    const svg = document.getElementById("team-portal-qr");
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      canvas.width = 400;
      canvas.height = 400;
      if (ctx) {
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, 400, 400);
      }

      const pngFile = canvas.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      downloadLink.download = "team-portal-qr.png";
      downloadLink.href = pngFile;
      downloadLink.click();

      toast({ title: "Downloaded!", description: "QR code saved as PNG" });
    };

    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  const handleOpenPortal = () => {
    window.location.assign(portalUrl);
  };

  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <header className="fixed top-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-sm z-10">
        <nav aria-label="Admin navigation" className="max-w-sm mx-auto">
          <Link to="/" aria-label="Back to admin">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Admin
            </Button>
          </Link>
        </nav>
      </header>

      <section className="w-full max-w-sm flex flex-col items-center gap-6 mt-16">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Team Portal QR</h1>
          <p className="text-muted-foreground text-sm">Scan to open the team login</p>
        </div>

        <article className="bg-card border border-border p-6 rounded-2xl shadow-sm">
          <QRCodeSVG
            id="team-portal-qr"
            value={portalUrl}
            size={260}
            level="H"
            includeMargin
            bgColor="#FFFFFF"
            fgColor="#000000"
          />
        </article>

        <section className="w-full" aria-label="Team portal link">
          <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
            <code className="text-xs flex-1 truncate text-center" title={portalUrl}>
              {portalUrl}
            </code>
            <Button variant="ghost" size="icon" onClick={handleCopy} className="flex-shrink-0" aria-label="Copy URL">
              {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
        </section>

        {window.location.hostname.endsWith("lovableproject.com") && (
          <aside className="w-full p-4 bg-muted rounded-lg border border-border text-sm text-muted-foreground">
            <p>
              Preview note: scanning the QR from a different phone/browser can trigger the preview-environment login.
              To generate a public QR, open this page with <code>?baseUrl=https://yourdomain.com</code>.
            </p>
          </aside>
        )}

        <section className="w-full p-4 bg-primary/5 rounded-lg border border-primary/20">
          <h2 className="font-medium text-sm mb-2 text-center">Instructions for teams</h2>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Scan the QR code with your phone</li>
            <li>Enter your team access code</li>
            <li>View and manage your assigned jobs</li>
          </ol>
        </section>

        <section className="flex flex-wrap gap-3 w-full" aria-label="QR actions">
          <Button variant="outline" className="flex-1" onClick={handleDownload}>
            <Download className="w-4 h-4 mr-2" />
            Download
          </Button>
          {canShare && (
            <Button variant="outline" className="flex-1" onClick={handleShare}>
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </Button>
          )}
        </section>

        <section className="w-full" aria-label="Open portal">
          <Button className="w-full" onClick={handleOpenPortal}>
            <ExternalLink className="w-4 h-4 mr-2" />
            Open Team Login
          </Button>
        </section>
      </section>
    </main>
  );
};

export default TeamQRCode;
