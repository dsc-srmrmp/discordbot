const fs = require("fs");
const path = require("path");
const { PermissionsBitField } = require("discord.js");
const { normalizePermissions } = require("../utils/permissions");
const { isBotOwner } = require("../utils/owners");

module.exports = (client) => {
  const slashCommandsPath = path.join(__dirname, "../slashCommands");
  const data = [];
  let totalCommands = 0;

  fs.readdirSync(slashCommandsPath).forEach((dir) => {
    const slashCommandFiles = fs
      .readdirSync(path.join(slashCommandsPath, dir))
      .filter((file) => file.endsWith(".js"));
    for (const file of slashCommandFiles) {
      let slashCommand;
      try {
        slashCommand = require(path.join(slashCommandsPath, dir, file));
      } catch (error) {
        client.logger.log(`Skipped slash command with load error: ${dir}/${file} (${error.message})`, "warn");
        continue;
      }

      if (
        !slashCommand.name ||
        !slashCommand.description ||
        typeof slashCommand.run !== "function"
      ) {
        client.logger.log(`Skipped invalid slash command: ${dir}/${file}`, "warn");
        continue;
      }

      slashCommand.botPerms = normalizePermissions(
        slashCommand.botPerms ??
          slashCommand.botPrams ??
          slashCommand.botPermissions ??
          [],
      );
      slashCommand.userPerms = normalizePermissions(
        slashCommand.userPerms ??
          slashCommand.userPrams ??
          slashCommand.userPermissions ??
          [],
      );
      client.slashCommands.set(slashCommand.name, slashCommand);
      data.push({
        name: slashCommand.name,
        description: slashCommand.description,
        options: slashCommand.options || [],
      });
      totalCommands++;
    }
  });

  client.logger.log(`Slash Commands Loaded: ${totalCommands}`, "cmd");

  const categoriesMap = new Map();

  client.commands.forEach((command) => {
    if (client.slashCommands.has(command.name)) return;

    const categoryName = String(command.category || "other").toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!categoriesMap.has(categoryName)) {
      categoriesMap.set(categoryName, []);
    }
    categoriesMap.get(categoryName).push(command);
  });

  let bridgedCount = 0;
  categoriesMap.forEach((commands, categoryName) => {
    const subcommands = commands.map((cmd) => {
      const subName = cmd.name.toLowerCase().replace(/[^a-z0-9_-]/g, "");
      const subOptions = [];
      if (cmd.usage || cmd.args) {
        subOptions.push({
          name: "query",
          description: cmd.usage ? `Args: ${cmd.usage}` : "Arguments for the command",
          type: 3, 
          required: cmd.args || false,
        });
      }

      return {
        name: subName,
        description: (cmd.description || `Execute prefix command: ${cmd.name}`).slice(0, 100),
        type: 1, 
        options: subOptions,
      };
    });

    const chunkedSubcommands = subcommands.slice(0, 25);

    const categorySlashCommand = {
      name: categoryName,
      description: `${categoryName.charAt(0).toUpperCase() + categoryName.slice(1)} commands category`,
      options: chunkedSubcommands,
      run: async (client, interaction, prefix) => {
        const subcommandName = interaction.options.getSubcommand();
        const prefixCommand = client.commands.get(subcommandName) || 
          client.commands.find((c) => c.name.toLowerCase() === subcommandName || (c.aliases && c.aliases.map(a => a.toLowerCase()).includes(subcommandName)));

        if (!prefixCommand) {
          return interaction.reply({ content: `Command \`${subcommandName}\` not found.`, ephemeral: true });
        }

        if (prefixCommand.owner && !isBotOwner(client, interaction.user.id)) {
          return interaction.reply({
            content: `Only configured bot owners can use this command.`,
            ephemeral: true,
          });
        }

        if (prefixCommand.botPerms && prefixCommand.botPerms.length > 0) {
          if (!interaction.guild.members.me.permissions.has(PermissionsBitField.resolve(prefixCommand.botPerms))) {
            return interaction.reply({
              content: `I don't have **\`${prefixCommand.botPerms.join(", ")}\`** permission in this server to execute this command.`,
              ephemeral: true,
            });
          }
        }
        if (prefixCommand.userPerms && prefixCommand.userPerms.length > 0) {
          if (!interaction.member.permissions.has(PermissionsBitField.resolve(prefixCommand.userPerms))) {
            return interaction.reply({
              content: `You don't have **\`${prefixCommand.userPerms.join(", ")}\`** permission in this server to execute this command.`,
              ephemeral: true,
            });
          }
        }

        const isSecurityCommand = prefixCommand.category === "Antinuke" || prefixCommand.category === "Automod";
        if (isSecurityCommand) {
          const AntiNuke = require("../schema/antinuke");
          const antinukeConfig = await AntiNuke.findOne({ guildId: interaction.guildId });
          const extraOwners = antinukeConfig?.extraOwners || [];
          const whitelistRoles = antinukeConfig?.whitelistRoles || [];

          const hasWhitelistedRole = interaction.member.roles.cache.some(role => whitelistRoles.includes(role.id));
          const isAuthorized =
            interaction.user.id === interaction.guild.ownerId ||
            isBotOwner(client, interaction.user.id) ||
            extraOwners.includes(interaction.user.id) ||
            hasWhitelistedRole;

          if (!isAuthorized) {
            return interaction.reply({
              content: `❌ | Only the **server owner**, **extra owners**, or members with **whitelisted roles** can use security commands.`,
              ephemeral: true,
            });
          }
        }

        const player = client.manager?.players?.get(interaction.guildId);
        if (prefixCommand.player && !player) {
          return interaction.reply({ content: `I'm not in any voice channel!`, ephemeral: true });
        }
        if (prefixCommand.inVoiceChannel && !interaction.member.voice.channelId) {
          return interaction.reply({ content: `You must be in a voice channel!`, ephemeral: true });
        }
        if (prefixCommand.sameVoiceChannel && player && interaction.member.voice.channelId !== player.voiceId) {
          return interaction.reply({ content: `You must be in the same voice channel as the bot!`, ephemeral: true });
        }

        await interaction.deferReply().catch(() => {});
        
        let hasBridgedReply = false; 

        const queryOption = interaction.options.getString("query") || "";
        const args = queryOption.trim().split(/ +/).filter(Boolean);

        let mentionedMember = null;
        let mentionedUser = null;

        if (queryOption) {
          const mentionMatch = queryOption.match(/\d{17,20}/);
          if (mentionMatch) {
            const targetId = mentionMatch[0];
            mentionedMember = interaction.guild.members.cache.get(targetId);
            
            if (!mentionedMember) {
              try {
                mentionedMember = await interaction.guild.members.fetch({ user: targetId, force: false });
              } catch (e) {
              }
            }
            
            mentionedUser = mentionedMember?.user || client.users.cache.get(targetId) || null;
          }
        }

        const shimChannel = Object.create(interaction.channel);
        shimChannel.send = async (options) => {
          if (typeof options === "string") options = { content: options };
          options.fetchReply = true;
          
          if (!hasBridgedReply) {
            hasBridgedReply = true;
            return interaction.editReply(options);
          }
          return interaction.followUp(options);
        };

        const shimMessage = {
          author: interaction.user,
          member: interaction.member,
          guild: interaction.guild,
          mentions: {
            users: {
              first: () => mentionedUser
            },
            members: {
              first: () => mentionedMember
            }
          },
          guildId: interaction.guildId,
          channel: shimChannel,
          channelId: interaction.channelId,
          content: `>${prefixCommand.name} ${queryOption}`,
          reply: async (options) => {
            if (typeof options === "string") options = { content: options };
            
            options.fetchReply = true; 
            
            if (!hasBridgedReply) {
              hasBridgedReply = true;
              return interaction.editReply(options);
            }
            return interaction.followUp(options);
          }
        };

        try {
          await prefixCommand.execute(shimMessage, args, client, prefix);
        } catch (error) {
          client.logger?.log(`[Slash Bridge] Command ${prefixCommand.name} failed: ${error.stack || error}`, "error");
          
          const errorPayload = { content: "An error occurred while executing this command." }; 
          if (!hasBridgedReply) {
            await interaction.editReply(errorPayload).catch(() => {});
          } else {
            await interaction.followUp(errorPayload).catch(() => {});
          }
        }
      } 
    }; 
    
    client.slashCommands.set(categoryName, categorySlashCommand);
    data.push({
      name: categorySlashCommand.name,
      description: categorySlashCommand.description,
      options: categorySlashCommand.options,
    });
    bridgedCount += chunkedSubcommands.length;
  }); 

  client.logger.log(`Dynamic Slash Commands Loaded: ${bridgedCount} commands mapped to ${categoriesMap.size} category groups`, "cmd");
  client.slashCommandData = data;
};