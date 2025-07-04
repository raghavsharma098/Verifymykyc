const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const LEGAL_DISCLAIMER = `LEGAL DISCLAIMER
All rights reserved. The report and its contents are the property of VerifyMyKYC (operated by Navigant Digital Pvt. Ltd.) and
may not be reproduced in any manner without the express written permission of VerifyMyKYC.
The reports and information contained herein are confidential and are meant only for the internal use of the VerifyMyKYC client
for assessing the background of their applicant. The information and report are subject to change based on changes in
factual information.
Information and reports, including text, graphics, links, or other items, are provided on an "as is," "as available" basis.
VerifyMyKYC expressly disclaims liability for errors or omissions in the report, information, and materials, as the information is
obtained from various sources as per industry practice. No warranty of any kind implied, express, or statutory including but
not limited to the warranties of non-infringement of third party rights, title, merchantability, fitness for a particular purpose,
and freedom from computer viruses, is given in conjunction with the information and materials.
Our findings are based on the information available to us and industry practice; therefore, we cannot guarantee the
accuracy of the information collected. Should additional information or documentation become available that impacts our
conclusions, we reserve the right to amend our findings accordingly.
These reports are not intended for publication or circulation. They should not be shared with any other person, including the
applicant, nor reproduced for any other purpose, in whole or in part, without prior written consent from VerifyMyKYC in each
specific instance. Our reports cannot be relied upon by any other person, and we expressly disclaim all responsibility or
liability for any costs, damages, losses, or expenses incurred by anyone as a result of the circulation, publication,
reproduction, or use of our reports contrary to the provisions of this paragraph.
The report and information consist of statements of opinion and not statements of fact or recommendations. You should
obtain any additional information necessary to make an informed decision prior to using the report. VerifyMyKYC and its
directors, officers, agents, and representatives assume (and hereby disclaim) all responsibility or liability that may arise
directly or indirectly from the usage of such reports.
Due to the limitations mentioned above, the result of our work with respect to background checks should be considered
only as a guideline. Our reports and comments should not be considered a definitive pronouncement on the individual.`;

function addFooter(doc) {
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
        doc.switchToPage(i);
        doc.fontSize(10)
           .fillColor('#666')
           .font('Helvetica')
           .text(`Page ${i + 1} of 2`, 0, doc.page.height - 30, { align: 'center' });
    }
}

function generatePDF(data, type, res) {
    const doc = new PDFDocument({ 
        margin: 50, 
        size: 'A4', 
        bufferPages: true,
        info: {
            Title: `${type.toUpperCase()} Verification Report`,
            Author: 'VerifyMyKYC',
            Subject: 'Verification Report',
            Keywords: 'verification, report, kyc',
            CreationDate: new Date()
        }
    });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${type}-verification.pdf`);

    // Pipe the PDF to the response
    doc.pipe(res);

    // Simple header
    doc.fillColor('#1a7f5a')
       .fontSize(24)
       .font('Helvetica-Bold')
       .text(`${type.toUpperCase()} Verification Report`, 50, 50)
       .fontSize(12)
       .text(new Date().toLocaleDateString(), 50, 80);

    // Simple separator line
    doc.moveTo(50, 100)
       .lineTo(doc.page.width - 50, 100)
       .strokeColor('#1a7f5a')
       .lineWidth(1)
       .stroke();

    doc.moveDown(2);

    // Filter out null/undefined values and verification date
    const entries = Object.entries(data)
        .filter(([key, value]) => value !== null && value !== undefined && key !== 'verificationDate')
        .map(([key, value]) => ({
            label: key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim(),
            value: String(value || 'N/A')
        }));

    // Simple table-like layout
    const rowHeight = 30;
    const labelWidth = 200;
    const valueX = 50 + labelWidth + 20;
    const valueWidth = doc.page.width - valueX - 50;

    entries.forEach(({ label, value }, index) => {
        const y = doc.y;

        // Simple alternating background
        if (index % 2 === 1) {
            doc.rect(50, y - 5, doc.page.width - 100, rowHeight)
               .fill('#f8f9fa');
        }

        // Label
        doc.font('Helvetica-Bold')
           .fontSize(12)
           .fillColor('#1a7f5a')
           .text(label + ':', 50, y, { width: labelWidth });

        // Value with special styling for status
        if (label.toLowerCase().includes('status')) {
            doc.font('Helvetica-Bold')
               .fontSize(12)
               .fillColor('#28a745')
               .text(value.toUpperCase(), valueX, y, { width: valueWidth });
        } else {
            doc.font('Helvetica')
               .fontSize(12)
               .fillColor('#333')
               .text(value, valueX, y, { width: valueWidth });
        }

        doc.moveDown(1);
    });

    // Add verification date if available
    if (data.verificationDate) {
        doc.moveDown(1);
        doc.font('Helvetica-Bold')
           .fontSize(12)
           .fillColor('#1a7f5a')
           .text('Verification Date:', 50, doc.y, { width: labelWidth });
        doc.font('Helvetica')
           .fontSize(12)
           .fillColor('#333')
           .text(new Date(data.verificationDate).toLocaleString(), valueX, doc.y, { width: valueWidth });
    }

    // Add footer to first page
    addFooter(doc);

    // Always add second page with legal disclaimer
    doc.addPage();
    
    // Simple disclaimer header
    doc.fontSize(20)
       .font('Helvetica-Bold')
       .fillColor('#1a7f5a')
       .text('Legal Disclaimer', { align: 'center' });
    
    doc.moveDown(1);

    // Simple disclaimer text
    doc.fontSize(11)
       .font('Helvetica')
       .fillColor('#333')
       .text(LEGAL_DISCLAIMER, { 
           align: 'justify',
           lineGap: 4,
           indent: 20
       });

    // Add footer to disclaimer page
    addFooter(doc);

    // Finalize the PDF
    doc.end();
}

module.exports = {
    generatePDF,
    LEGAL_DISCLAIMER
}; 