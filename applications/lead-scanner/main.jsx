import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  Camera as CameraIcon, 
  History, 
  Download, 
  Trash2, 
  X, 
  CheckCircle2, 
  QrCode,
  Smartphone,
  Info,
  Mail,
  Building2,
  ChevronRight,
  Database,
  Trash
} from 'lucide-react';
import { Html5QrcodeScanner, Html5Qrcode } from 'html5-qrcode';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import './app.css';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const App = () => {
  const [scans, setScans] = useState(() => {
    const saved = localStorage.getItem('lead-scans');
    return saved ? JSON.parse(saved) : [];
  });
  const [isScanning, setIsScanning] = useState(false);
  const [lastScan, setLastScan] = useState(null);
  const [view, setView] = useState('home'); // 'home', 'history'
  const scannerRef = useRef(null);
  const [cameraPermission, setCameraPermission] = useState('unknown');

  useEffect(() => {
    localStorage.setItem('lead-scans', JSON.stringify(scans));
  }, [scans]);

  const parseScanData = (data) => {
    const parts = data.split('~');
    return {
      conference_id: parts[0] || '',
      first_name: parts[1] || '',
      last_name: parts[2] || '',
      email: parts[3] || '',
      job_title: parts[4] || '',
      company: parts[5] || '',
      phone_number: parts[6] || '',
      zip_code: parts[7] || '',
      unknown_id: parts[8] || ''
    };
  };

  const onScanSuccess = (decodedText) => {
    // Simple deduplication logic: don't scan the same thing twice within 3 seconds
    if (lastScan && lastScan.rawData === decodedText && Date.now() - lastScan.id < 3000) {
      return;
    }

    const newScan = {
      id: Date.now(),
      rawData: decodedText,
      parsed: parseScanData(decodedText),
      timestamp: new Date().toLocaleString(),
      isoTimestamp: new Date().toISOString(),
      type: 'QR_CODE'
    };
    
    setScans(prev => [newScan, ...prev]);
    setLastScan(newScan);
    setIsScanning(false);
    
    if (scannerRef.current) {
      scannerRef.current.stop().catch(err => console.error(err));
    }
  };

  const startScanner = async () => {
    setIsScanning(true);
    setLastScan(null);
    
    // Give DOM time to render the reader div
    setTimeout(() => {
      const html5QrCode = new Html5Qrcode("reader");
      scannerRef.current = html5QrCode;
      
      const config = { fps: 10, qrbox: { width: 250, height: 250 } };
      
      html5QrCode.start(
        { facingMode: "environment" }, 
        config, 
        onScanSuccess,
        (errorMessage) => {
          // ignore scan errors
        }
      ).catch((err) => {
        console.error("Scanner start error", err);
        setIsScanning(false);
        alert("Could not access camera. Please check permissions.");
      });
    }, 100);
  };

  const stopScanner = () => {
    if (scannerRef.current) {
      scannerRef.current.stop().then(() => {
        setIsScanning(false);
      }).catch(err => {
        console.error(err);
        setIsScanning(false);
      });
    } else {
      setIsScanning(false);
    }
  };

  const deleteScan = (id) => {
    setScans(prev => prev.filter(scan => scan.id !== id));
  };

  const clearAll = () => {
    if (window.confirm("Are you sure you want to clear all scan history?")) {
      setScans([]);
    }
  };

  const exportToCSV = () => {
    if (scans.length === 0) return;
    
    const headers = [
      'Scan Timestamp', 
      'Conference ID', 
      'First Name', 
      'Last Name', 
      'Email', 
      'Job Title', 
      'Company', 
      'Phone Number', 
      'Zip Code', 
      'Unknown ID'
    ];

    const rows = scans.map(s => [
      s.isoTimestamp,
      s.parsed.conference_id,
      `"${s.parsed.first_name}"`,
      `"${s.parsed.last_name}"`,
      s.parsed.email,
      `"${s.parsed.job_title}"`,
      `"${s.parsed.company}"`,
      `'${s.parsed.phone_number}`,
      s.parsed.zip_code,
      s.parsed.unknown_id
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `conference_leads_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Header */}
      <header className="bg-indigo-700 h-14 flex items-center justify-between px-6 shadow-md shrink-0">
        <div className="flex items-center gap-2">
          <QrCode className="text-white" size={24} />
          <h1 className="text-white text-lg font-bold">Badge Scanner</h1>
        </div>
        <span className="text-indigo-200 text-xs font-mono">v1.1.0 (PWA)</span>
      </header>

      {/* Navigation Tabs */}
      <nav className="flex bg-white border-b border-slate-200 shrink-0">
        <button 
          onClick={() => setView('home')}
          className={cn(
            "flex-1 py-4 flex items-center justify-center gap-2 text-sm font-bold transition-all border-b-4",
            view === 'home' ? "border-indigo-600 bg-indigo-50/50 text-indigo-600" : "border-transparent text-slate-400"
          )}
        >
          <CameraIcon size={20} />
          <span>Scanner</span>
        </button>
        <button 
          onClick={() => setView('history')}
          className={cn(
            "flex-1 py-4 flex items-center justify-center gap-2 text-sm font-bold transition-all border-b-4",
            view === 'history' ? "border-indigo-600 bg-indigo-50/50 text-indigo-600" : "border-transparent text-slate-400"
          )}
        >
          <History size={20} />
          <span>Leads ({scans.length})</span>
        </button>
      </nav>

      <main className="flex-1 overflow-auto">
        {view === 'home' ? (
          <div className="p-6 flex flex-col items-center">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-black text-slate-800">Scan Attendee</h2>
              <p className="text-sm text-slate-500 mt-1">Ready for next lead</p>
            </div>

            {/* Viewfinder Area */}
            <div className="p-2 bg-white rounded-[2.5rem] shadow-xl">
              <div className="w-[280px] h-[280px] bg-slate-950 rounded-[2rem] overflow-hidden relative flex items-center justify-center">
                {isScanning ? (
                  <>
                    <div id="reader" className="absolute inset-0 w-full h-full"></div>
                    <div className="scan-line"></div>
                  </>
                ) : (
                  <button 
                    onClick={startScanner}
                    className="flex flex-col items-center group transition-all"
                  >
                    <div className="p-6 bg-slate-900 rounded-full mb-4 group-hover:bg-slate-800 transition-colors">
                      <Smartphone size={56} className="text-indigo-400" />
                    </div>
                    <span className="text-slate-400 text-[10px] font-black tracking-widest uppercase">Activate Camera</span>
                  </button>
                )}

                {/* Corner Accents */}
                <div className="absolute top-6 left-6 w-8 h-8 border-t-4 border-l-4 border-white/40 rounded-tl-lg pointer-events-none"></div>
                <div className="absolute top-6 right-6 w-8 h-8 border-t-4 border-r-4 border-white/40 rounded-tr-lg pointer-events-none"></div>
                <div className="absolute bottom-6 left-6 w-8 h-8 border-b-4 border-l-4 border-white/40 rounded-bl-lg pointer-events-none"></div>
                <div className="absolute bottom-6 right-6 w-8 h-8 border-b-4 border-r-4 border-white/40 rounded-br-lg pointer-events-none"></div>
              </div>
            </div>

            {isScanning && (
              <div className="mt-8 w-full">
                <button 
                  onClick={stopScanner}
                  className="w-full py-3 text-slate-400 font-bold text-sm hover:text-slate-600 transition-colors"
                >
                  Stop Scanning
                </button>
              </div>
            )}

            {!isScanning && lastScan && (
              <div className="w-full mt-8 bg-white border-2 border-emerald-100 rounded-[1.25rem] p-5 flex gap-4 shadow-sm animate-in fade-in slide-in-from-bottom-4">
                <div className="p-3 bg-emerald-50 rounded-full h-fit">
                  <CheckCircle2 size={24} className="text-emerald-500" />
                </div>
                <div className="flex-1">
                  <span className="text-[10px] font-black text-emerald-600 tracking-wider mb-1 block">SUCCESS: NEW LEAD</span>
                  <h3 className="text-lg font-bold text-slate-800 leading-tight">
                    {lastScan.parsed.first_name} {lastScan.parsed.last_name}
                  </h3>
                  <p className="text-sm text-slate-500 italic font-medium">{lastScan.parsed.company}</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-5 bg-slate-50/90 sticky top-0 z-10 backdrop-blur-sm">
              <h2 className="text-xl font-black text-slate-800">Lead Database</h2>
              <div className="flex items-center gap-3">
                <button 
                  onClick={exportToCSV}
                  disabled={scans.length === 0}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-30 text-white flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm"
                >
                  <Download size={16} />
                  <span>Export CSV</span>
                </button>
                <button 
                  onClick={clearAll}
                  disabled={scans.length === 0}
                  className="p-2 text-slate-400 hover:text-red-500 disabled:opacity-30 transition-colors"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            </div>

            <div className="px-4 pb-20 space-y-4">
              {scans.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                    <History size={40} className="text-slate-300" />
                  </div>
                  <p className="text-slate-400 font-bold">No leads collected</p>
                  <button 
                    onClick={() => setView('home')}
                    className="mt-4 text-indigo-600 font-bold text-sm"
                  >
                    Go to Scanner
                  </button>
                </div>
              ) : (
                scans.map((scan) => (
                  <div key={scan.id} className="bg-white border border-slate-200 rounded-[1.25rem] p-5 shadow-sm">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <span className="text-[10px] font-bold text-indigo-500 tracking-wider uppercase">{scan.timestamp}</span>
                        <h3 className="text-lg font-black text-slate-800 leading-tight mt-0.5">
                          {scan.parsed.first_name} {scan.parsed.last_name}
                        </h3>
                      </div>
                      <button 
                        onClick={() => deleteScan(scan.id)}
                        className="p-1 text-slate-200 hover:text-red-400 transition-colors"
                      >
                        <X size={18} />
                      </button>
                    </div>

                    <div className="border-t border-slate-50 pt-3 space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Building2 size={14} className="text-slate-400" />
                        <span className="font-bold text-slate-600">{scan.parsed.company}</span>
                        <span className="text-slate-300">•</span>
                        <span className="text-slate-500">{scan.parsed.job_title}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Mail size={14} className="text-slate-400" />
                        <span className="text-slate-500">{scan.parsed.email}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mt-4">
                      <span className="bg-slate-100 px-2 py-1 rounded text-[10px] font-black text-slate-500 uppercase">CID: {scan.parsed.conference_id}</span>
                      <span className="bg-slate-100 px-2 py-1 rounded text-[10px] font-black text-slate-500 uppercase">ZIP: {scan.parsed.zip_code}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>

      {/* Info Bar */}
      <footer className="bg-slate-900 flex items-center p-4 gap-3 shrink-0">
        <Info size={14} className="text-indigo-400" />
        <span className="text-white text-[10px] font-bold tracking-wider uppercase">CSV SCHEMA: TIMESTAMP + 9 TILDE-PARSED FIELDS</span>
      </footer>
    </div>
  );
};

const container = document.getElementById('lead-scanner-root');
const root = createRoot(container);
root.render(<App />);
