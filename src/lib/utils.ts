import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

let isProcessingPrint = false;

/**
 * Triggers the browser's print dialog with best-practices for enterprise applications.
 * Handles focus, processing state, and ensures UI settles before printing.
 */
export function triggerPrint() {
  if (isProcessingPrint) return;
  
  try {
    isProcessingPrint = true;
    
    // Add a class to body for additional CSS targeting if needed
    document.body.classList.add('printing-in-progress');

    // Ensure window is focused - critical for some browser print dialogs
    window.focus();

    // Use a small delay to let any active hover states or tooltips settle
    // and to ensure React has finished any immediate state updates
    setTimeout(() => {
      // Trigger print
      window.print();
      
      // Cleanup after a delay (onafterprint is more reliable but this works as a fallback)
      const cleanup = () => {
        document.body.classList.remove('printing-in-progress');
        isProcessingPrint = false;
        window.removeEventListener('afterprint', cleanup);
      };

      window.addEventListener('afterprint', cleanup);
      
      // Fallback cleanup if afterprint doesn't fire (some browsers/versions)
      setTimeout(cleanup, 2000);
    }, 250);
  } catch (error) {
    console.error('Print failed:', error);
    document.body.classList.remove('printing-in-progress');
    isProcessingPrint = false;
  }
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-GH', {
    style: 'currency',
    currency: 'GHS',
  }).format(amount);
}

const FIX_COLORS_STYLE = `
  /* Force standard colors and layouts for the capture session */
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-scheme: light !important;
  }
  
  /* Hardcoded fallbacks for Tailwind v4 colors often using oklch */
  :root {
    --color-indigo-600: #4f46e5 !important;
    --color-indigo-50: #eef2ff !important;
    --color-slate-900: #0f172a !important;
    --color-slate-800: #1e293b !important;
    --color-slate-500: #64748b !important;
    --color-slate-100: #f1f5f9 !important;
    --color-emerald-600: #059669 !important;
    --color-rose-600: #e11d48 !important;
  }

  .bg-indigo-600 { background-color: #4f46e5 !important; }
  .text-indigo-600 { color: #4f46e5 !important; }
  .bg-emerald-500 { background-color: #10b981 !important; }
  .text-emerald-500 { color: #10b981 !important; }
  .bg-amber-500 { background-color: #f59e0b !important; }
  .text-amber-500 { color: #f59e0b !important; }
  .bg-rose-500 { background-color: #f43f5e !important; }
  .text-rose-500 { color: #f43f5e !important; }
  .bg-slate-900 { background-color: #0f172a !important; }
  .text-slate-900 { color: #0f172a !important; }
  .bg-slate-800 { background-color: #1e293b !important; }
  .text-slate-800 { color: #1e293b !important; }
  .text-slate-700 { color: #334155 !important; }
  .text-slate-600 { color: #475569 !important; }
  .text-slate-500 { color: #64748b !important; }
  .text-slate-400 { color: #94a3b8 !important; }
  .border-slate-300 { border-color: #cbd5e1 !important; }
  .border-slate-200 { border-color: #e2e8f0 !important; }
  .border-slate-100 { border-color: #f1f5f9 !important; }
  .bg-slate-50 { background-color: #f8fafc !important; }
  .bg-slate-100 { background-color: #f1f5f9 !important; }
  .text-rose-700 { color: #be123c !important; }
  .text-rose-600 { color: #e11d48 !important; }
  .text-emerald-600 { color: #059669 !important; }
  .bg-indigo-50 { background-color: #eef2ff !important; }
  .bg-indigo-900 { background-color: #1e1b4b !important; }
  .text-indigo-950 { color: #1e1b4b !important; }
  .text-indigo-900 { color: #1e1b4b !important; }
  .text-white { color: #ffffff !important; }
  
  /* Table specific fixes */
  thead { background-color: #1e1b4b !important; }
  th { color: #ffffff !important; }
  
  /* Ensure border colors also show */
  .border-white { border-color: #ffffff !important; }
  .border-indigo-900 { border-color: #1e1b4b !important; }
  .border-indigo-800 { border-color: #312e81 !important; }

  /* Force exact A4 geometry for ReportCard during PDF capture on any screen */
  .ReportCard {
    width: 794px !important;
    min-width: 794px !important;
    max-width: 794px !important;
    min-height: 1123px !important;
    padding: 42px 45px !important;
    border-radius: 0 !important;
    border: 8px double #1e1b4b !important;
    box-sizing: border-box !important;
    background: #ffffff !important;
    display: flex !important;
    flex-direction: column !important;
    justify-content: space-between !important;
    margin: 0 !important;
  }

  .ReportCard-bio-grid {
    display: grid !important;
    grid-template-columns: repeat(12, minmax(0, 1fr)) !important;
    gap: 16px !important;
    align-items: center !important;
  }

  .ReportCard-bio-grid > :first-child {
    grid-column: span 3 / span 3 !important;
  }

  .ReportCard-details-grid {
    display: grid !important;
    grid-column: span 9 / span 9 !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    column-gap: 20px !important;
    row-gap: 6px !important;
  }

  .ReportCard-footer-grid {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 18px !important;
  }

  .ReportCard-sig-grid {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 40px !important;
  }
`;

function onCloneForPDF(clonedDoc: Document, targetElementId?: string) {
  const allElements = clonedDoc.getElementsByTagName('*');
  const problematicProps = ['color', 'backgroundColor', 'borderColor', 'outlineColor', 'stopColor', 'fill', 'stroke', 'border-color', 'background-color'];
  
  for (let i = 0; i < allElements.length; i++) {
    const el = allElements[i] as HTMLElement;
    const computedStyle = window.getComputedStyle(el);
    
    problematicProps.forEach(prop => {
      const val = (el.style as any)[prop] || computedStyle.getPropertyValue(prop);
      if (val && (val.indexOf('oklch') !== -1 || val.indexOf('oklab') !== -1)) {
        (el.style as any)[prop] = 'inherit';
      }
    });
    
    if (el.hasAttribute('style')) {
      const styleAttr = el.getAttribute('style') || '';
      if (styleAttr.includes('oklch') || styleAttr.includes('oklab')) {
         el.setAttribute('style', styleAttr.replace(/--[^;]+:[^;]*okl(ch|ab)[^;]*;?/g, ''));
      }
    }
  }

  const style = clonedDoc.createElement('style');
  style.innerHTML = FIX_COLORS_STYLE;
  clonedDoc.head.appendChild(style);

  if (targetElementId) {
    const targetEl = clonedDoc.getElementById(targetElementId);
    if (targetEl && (targetEl.classList.contains('ReportCard') || targetEl.querySelector('.ReportCard'))) {
      targetEl.style.width = '794px';
      targetEl.style.minWidth = '794px';
      targetEl.style.maxWidth = '794px';
      targetEl.style.margin = '0';
      targetEl.style.padding = '0';
    }
  }
}

export async function exportToPDF(elementId: string, filename: string) {
  const element = document.getElementById(elementId);
  if (!element) return;

  try {
    const { jsPDF } = await import('jspdf');
    const html2canvas = (await import('html2canvas')).default;
    const isReportCard = element.classList.contains('ReportCard') || Boolean(element.querySelector('.ReportCard'));

    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: isReportCard ? 1024 : Math.max(window.innerWidth, 1024),
      onclone: (doc) => onCloneForPDF(doc, elementId)
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    if (isReportCard) {
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    } else {
      const ratio = canvas.height / canvas.width;
      const renderedHeight = Math.min(pdfHeight, pdfWidth * ratio);
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, renderedHeight);
    }
    pdf.save(`${filename}.pdf`);
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
}

export async function exportBatchToPDF(elementIds: string[], filename: string) {
  try {
    const { jsPDF } = await import('jspdf');
    const html2canvas = (await import('html2canvas')).default;

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    for (let i = 0; i < elementIds.length; i++) {
       const elementId = elementIds[i];
       const element = document.getElementById(elementId);
       if (!element) continue;

       if (i > 0) pdf.addPage();

       const canvas = await html2canvas(element, {
         scale: 2,
         useCORS: true,
         logging: false,
         backgroundColor: '#ffffff',
         windowWidth: 1024,
         onclone: (doc) => onCloneForPDF(doc, elementId)
       });

       const imgData = canvas.toDataURL('image/png');
       const pdfWidth = pdf.internal.pageSize.getWidth();
       const pdfHeight = pdf.internal.pageSize.getHeight();
       
       pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    }

    pdf.save(`${filename}.pdf`);
  } catch (error) {
    console.error('Error generating Batch PDF:', error);
    throw error;
  }
}
