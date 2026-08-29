{{/*
Expand the name of the chart.
*/}}
{{- define "ba-ddd-mapper.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Fully qualified app name, capped at 63 chars for the DNS label limit.
*/}}
{{- define "ba-ddd-mapper.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "ba-ddd-mapper.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "ba-ddd-mapper.labels" -}}
helm.sh/chart: {{ include "ba-ddd-mapper.chart" . }}
{{ include "ba-ddd-mapper.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: ba-hub
{{- end }}

{{- define "ba-ddd-mapper.selectorLabels" -}}
app.kubernetes.io/name: {{ include "ba-ddd-mapper.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "ba-ddd-mapper.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "ba-ddd-mapper.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Image reference, defaulting the tag to the chart appVersion.
*/}}
{{- define "ba-ddd-mapper.image" -}}
{{- printf "%s:%s" .Values.image.repository (default .Chart.AppVersion .Values.image.tag) }}
{{- end }}
