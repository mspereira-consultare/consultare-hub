import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs' // Importa o criptografador

const prisma = new PrismaClient()

async function main() {
  // Criptografa a senha antes de salvar
  const passwordHash = await hash('senha123', 12) 

  const admin = await prisma.user.upsert({
    where: { email: 'admin@consultare.com.br' },
    // Agora o update atualiza a senha caso o usuário já exista
    update: {
      password: passwordHash, 
    },
    create: {
      email: 'admin@consultare.com.br',
      name: 'Administrador Principal',
      password: passwordHash, // Salva criptografado
      role: 'ADMIN',
    },
  })

  console.log({ admin })
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })