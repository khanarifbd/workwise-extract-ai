import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Download, Copy, Check, QrCode, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

interface TeamPortalQRModalProps {
  onClose: () => void;
}

export const TeamPortalQRModal = ({ onClose }: TeamPortalQRModalProps) => {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  
  const portalUrl = `${window.location.origin}/team`;

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

  const handleOpenPortal = () => {
    window.open(portalUrl, '_blank');
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <QrCode className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Team Portal QR Code</h2>
              <p className="text-xs text-muted-foreground">Scan to access the team portal</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col items-center space-y-6">
          {/* QR Code */}
          <div className="bg-white p-4 rounded-xl shadow-inner">
            <QRCodeSVG
              id="team-portal-qr"
              value={portalUrl}
              size={200}
              level="H"
              includeMargin={true}
              bgColor="#FFFFFF"
              fgColor="#000000"
            />
          </div>

          {/* URL Display */}
          <div className="w-full">
            <p className="text-xs text-muted-foreground mb-2 text-center">Portal URL</p>
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <code className="text-sm flex-1 truncate">{portalUrl}</code>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCopy}
                className="flex-shrink-0"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Instructions */}
          <div className="w-full p-4 bg-primary/5 rounded-lg border border-primary/20">
            <h4 className="font-medium text-sm mb-2">Instructions for teams:</h4>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Scan the QR code with your phone</li>
              <li>Enter your team access code</li>
              <li>View and manage your assigned jobs</li>
            </ol>
          </div>

          {/* Actions */}
          <div className="flex gap-3 w-full">
            <Button variant="outline" className="flex-1" onClick={handleDownload}>
              <Download className="w-4 h-4 mr-2" />
              Download PNG
            </Button>
            <Button className="flex-1" onClick={handleOpenPortal}>
              <ExternalLink className="w-4 h-4 mr-2" />
              Open Portal
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
