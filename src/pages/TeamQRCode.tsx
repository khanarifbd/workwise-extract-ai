import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Download, Copy, Check, Share2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'react-router-dom';

const TeamQRCode = () => {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const portalUrl = `${window.location.origin}/team`;
  const canShare = typeof navigator !== 'undefined' && !!navigator.share;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(portalUrl);
      setCopied(true);
      toast({
        title: 'Copied!',
        description: 'Team portal URL copied to clipboard',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to copy URL',
        variant: 'destructive',
      });
    }
  };

  const handleShare = async () => {
    try {
      await navigator.share({
        title: 'AllSaints Team Portal',
        text: 'Access the team portal to view and manage your assigned jobs.',
        url: portalUrl,
      });
      toast({
        title: 'Shared!',
        description: 'Team portal link shared successfully',
      });
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        toast({
          title: 'Share failed',
          description: 'Could not share the link',
          variant: 'destructive',
        });
      }
    }
  };

  const handleDownload = () => {
    const svg = document.getElementById('team-portal-qr');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = 400;
      canvas.height = 400;
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, 400, 400);
      }

      const pngFile = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.download = 'team-portal-qr.png';
      downloadLink.href = pngFile;
      downloadLink.click();

      toast({
        title: 'Downloaded!',
        description: 'QR code saved as PNG',
      });
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      {/* Back button for mobile */}
      <div className="fixed top-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-sm z-10">
        <Link to="/">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Admin
          </Button>
        </Link>
      </div>

      <div className="w-full max-w-sm flex flex-col items-center space-y-6 mt-16">
        {/* Title */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Team Portal</h1>
          <p className="text-muted-foreground text-sm">Scan to access the team portal</p>
        </div>

        {/* QR Code */}
        <div className="bg-white p-6 rounded-2xl shadow-lg">
          <QRCodeSVG
            id="team-portal-qr"
            value={portalUrl}
            size={240}
            level="H"
            includeMargin={true}
            bgColor="#FFFFFF"
            fgColor="#000000"
          />
        </div>

        {/* URL Display */}
        <div className="w-full">
          <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
            <code className="text-xs flex-1 truncate text-center">{portalUrl}</code>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopy}
              className="flex-shrink-0"
            >
              {copied ? (
                <Check className="w-4 h-4 text-success" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Instructions */}
        <div className="w-full p-4 bg-primary/5 rounded-lg border border-primary/20">
          <h4 className="font-medium text-sm mb-2 text-center">Instructions for teams:</h4>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Scan the QR code with your phone</li>
            <li>Enter your team access code</li>
            <li>View and manage your assigned jobs</li>
          </ol>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3 w-full">
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
        </div>

        {/* Open Portal Link */}
        <Link to="/team" className="w-full">
          <Button className="w-full">
            Open Team Portal
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default TeamQRCode;