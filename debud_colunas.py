import pandas as pd
import os
from dotenv import load_dotenv
from workers.feegow_client import list_profissionals, list_especialidades

# Carrega ambiente
load_dotenv()

print("--- DIAGNÓSTICO DE COLUNAS FEEGOW ---")

# 1. Teste Profissionais
print("\n1. Buscando Profissionais...")
df_prof = list_profissionals()
if not df_prof.empty:
    print(f"Colunas encontradas: {df_prof.columns.tolist()}")
    print("Primeira linha:")
    print(df_prof.iloc[0].to_dict())
else:
    print("DataFrame de Profissionais veio vazio.")

# 2. Teste Especialidades
print("\n2. Buscando Especialidades...")
df_esp = list_especialidades()
if not df_esp.empty:
    print(f"Colunas encontradas: {df_esp.columns.tolist()}")
    print("Primeira linha:")
    print(df_esp.iloc[0].to_dict())
else:
    print("DataFrame de Especialidades veio vazio.")