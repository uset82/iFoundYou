import { useState } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import './QRScannerModal.css';

interface QRScannerModalProps {
  onScan: (roomId: string, psk: string, name: string, type: string) => void;
  onClose: () => void;
}

export default function QRScannerModal({ onScan, onClose }: QRScannerModalProps) {
  const [error, setError] = useState<string | null>(null);

  const handleDecode = (result: string) => {
    try {
      // expected format: dommedag://channel/<id>?key=<psk>&name=<name>&type=<type>
      if (!result.startsWith('dommedag://channel/')) {
        setError('Invalid QR code format');
        return;
      }

      const url = new URL(result);
      const roomId = url.pathname.replace('//channel/', ''); // handles dommedag://channel/123
      const key = url.searchParams.get('key');
      const name = url.searchParams.get('name');
      const type = url.searchParams.get('type') || 'custom';

      if (!roomId || !key || !name) {
        setError('Missing channel information in QR code');
        return;
      }

      onScan(roomId, key, name, type);
    } catch (err) {
      setError('Failed to parse QR code');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content scanner-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Scan Invite</h3>
          <button className="ghost small" onClick={onClose}>
            Close
          </button>
        </div>
        
        <div className="scanner-container">
          <Scanner 
            onScan={(detectedCodes) => {
              if (detectedCodes && detectedCodes.length > 0) {
                handleDecode(detectedCodes[0].rawValue);
              }
            }} 
            onError={(e: unknown) => setError('Camera error: ' + (e instanceof Error ? e.message : String(e)))}
          />
        </div>

        {error ? (
          <p className="error scanner-error">{error}</p>
        ) : (
          <p className="muted scanner-instructions">Point camera at a channel QR code</p>
        )}
      </div>
    </div>
  );
}
