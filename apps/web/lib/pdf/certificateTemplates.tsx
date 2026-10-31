// Explicit React import: Next builds this with the automatic JSX runtime, but
// Vitest's esbuild transform uses the classic one, and this module is rendered
// directly in a unit test. Without it the test sees "React is not defined".
import React from "react";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

// @react-pdf/renderer rather than puppeteer: it renders to a Buffer in pure
// JS, so there is no Chromium binary to install on Windows dev or in the
// Railway container. pdfkit/pdf-lib would work too, but both are imperative
// drawing APIs — every layout tweak means recomputing coordinates, which is
// the wrong trade for a branded document that will be iterated on.

const BRAND_FALLBACK = "#1f4e3d";

export type CertificateData =
  | {
      type: "ATTENDANCE";
      studentName: string;
      academyName: string;
      logoUrl: string | null;
      brandColor: string | null;
      issuedOn: string;
      attendedCount: number;
      sessionCount: number;
      attendanceRate: string;
    }
  | {
      type: "RATING_MILESTONE";
      studentName: string;
      academyName: string;
      logoUrl: string | null;
      brandColor: string | null;
      issuedOn: string;
      federation: string;
      rating: number;
      federationId: string | null;
      recordedOn: string;
    }
  | {
      type: "TOURNAMENT_RESULT";
      studentName: string;
      academyName: string;
      logoUrl: string | null;
      brandColor: string | null;
      issuedOn: string;
      eventName: string;
      eventResult: string;
      eventDate: string;
    };

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 12, fontFamily: "Helvetica", color: "#1c1c1c" },
  frame: { border: "2pt solid", borderColor: BRAND_FALLBACK, height: "100%", padding: 36 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 28 },
  logo: { width: 44, height: 44, marginRight: 12, objectFit: "contain" },
  academy: { fontSize: 14, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
  title: { fontSize: 26, fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 6 },
  kicker: { fontSize: 10, textAlign: "center", letterSpacing: 2, color: "#6b6b6b", marginBottom: 28 },
  presented: { fontSize: 11, textAlign: "center", color: "#6b6b6b" },
  name: { fontSize: 24, fontFamily: "Helvetica-Bold", textAlign: "center", marginTop: 8, marginBottom: 20 },
  body: { fontSize: 12, textAlign: "center", lineHeight: 1.6, marginHorizontal: 24 },
  statRow: { flexDirection: "row", justifyContent: "center", marginTop: 26 },
  stat: { alignItems: "center", marginHorizontal: 22 },
  statValue: { fontSize: 20, fontFamily: "Helvetica-Bold" },
  statLabel: { fontSize: 9, color: "#6b6b6b", letterSpacing: 1, marginTop: 4 },
  footer: { position: "absolute", bottom: 36, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between" },
  footerLabel: { fontSize: 9, color: "#6b6b6b" },
  signatureLine: { borderTop: "1pt solid #9a9a9a", width: 160, paddingTop: 4 },
});

const TITLES: Record<CertificateData["type"], string> = {
  ATTENDANCE: "Certificate of Attendance",
  RATING_MILESTONE: "Certificate of Rating Achievement",
  TOURNAMENT_RESULT: "Certificate of Tournament Result",
};

function CertificateShell({
  data,
  children,
}: {
  data: CertificateData;
  children: React.ReactNode;
}) {
  const brand = data.brandColor ?? BRAND_FALLBACK;
  return (
    <Document title={`${TITLES[data.type]} — ${data.studentName}`}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={[styles.frame, { borderColor: brand }]}>
          <View style={styles.header}>
            {/* Logo is optional — plenty of academies never upload one. */}
            {data.logoUrl ? <Image src={data.logoUrl} style={styles.logo} /> : null}
            <Text style={[styles.academy, { color: brand }]}>{data.academyName}</Text>
          </View>

          <Text style={styles.kicker}>CHESS ACADEMY</Text>
          <Text style={[styles.title, { color: brand }]}>{TITLES[data.type]}</Text>

          <Text style={styles.presented}>This certifies that</Text>
          <Text style={styles.name}>{data.studentName}</Text>

          {children}

          <View style={styles.footer}>
            <View>
              <Text style={styles.footerLabel}>Issued {data.issuedOn}</Text>
            </View>
            <View style={styles.signatureLine}>
              <Text style={styles.footerLabel}>{data.academyName}</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}

function CertificateBody({ data }: { data: CertificateData }) {
  switch (data.type) {
    case "ATTENDANCE":
      return (
        <>
          <Text style={styles.body}>
            has demonstrated consistent commitment to their chess training, attending{" "}
            {data.attendedCount} of {data.sessionCount} scheduled sessions.
          </Text>
          <View style={styles.statRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{data.attendanceRate}</Text>
              <Text style={styles.statLabel}>ATTENDANCE RATE</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{data.attendedCount}</Text>
              <Text style={styles.statLabel}>SESSIONS ATTENDED</Text>
            </View>
          </View>
        </>
      );
    case "RATING_MILESTONE":
      return (
        <>
          <Text style={styles.body}>
            has achieved an official {data.federation} rating, recorded on {data.recordedOn}
            {data.federationId ? ` (${data.federation} ID ${data.federationId})` : ""}.
          </Text>
          <View style={styles.statRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{data.rating}</Text>
              <Text style={styles.statLabel}>{data.federation} RATING</Text>
            </View>
          </View>
        </>
      );
    case "TOURNAMENT_RESULT":
      return (
        <>
          <Text style={styles.body}>
            competed in {data.eventName} on {data.eventDate}, achieving the following result:
          </Text>
          <View style={styles.statRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{data.eventResult}</Text>
              <Text style={styles.statLabel}>RESULT</Text>
            </View>
          </View>
        </>
      );
  }
}

export function renderCertificatePdf(data: CertificateData): Promise<Buffer> {
  return renderToBuffer(
    <CertificateShell data={data}>
      <CertificateBody data={data} />
    </CertificateShell>
  );
}
