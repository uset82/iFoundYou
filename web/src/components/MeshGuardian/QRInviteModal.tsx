import { QRCodeSVG } from 'qrcode.react';
import './QRInviteModal.css';

interface QRInviteModalProps {
  roomId: string;
  name: string;
  psk: string;
  type: string;
  onClose: () => void;
}

export default function QRInviteModal({ roomId, name, psk, type, onClose }: QRInviteModalProps) {
  // Deep link payload for joining channel
  const payload = `dommedag://channel/${roomId}?key=${encodeURIComponent(psk)}&name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content qr-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Channel Invite</h3>
          <button className="ghost small" onClick={onClose}>
            Close
          </button>
        </div>
        
        <div className="qr-container">
          <QRCodeSVG 
            value={payload} 
            size={240} 
            bgColor={"#ffffff"}
            fgColor={"#000000"}
            level={"M"}
            includeMargin={true}
          />
        </div>

        <p className="qr-instructions muted">
          Scan this code with another device to join the <strong>{name}</strong> channel.
        </p>

        <div className="qr-actions">
          <button className="primary block" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
